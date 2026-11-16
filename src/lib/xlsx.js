/**
 * 轻量 XLSX 读写（零第三方依赖）
 *
 * 写入：生成单工作表的 .xlsx，带表头样式、冻结首行、列宽、边框与自动筛选。
 * 读取：解析 .xlsx（支持 sharedStrings / inlineStr / 数字 / 布尔 / 公式缓存值）。
 *
 * 实现要点：.xlsx 本质是 ZIP 包内的若干 XML 文件，因此这里用 node:zlib 手写
 * ZIP 容器（存储/Deflate），再用字符串模板拼出 SpreadsheetML，避免引入
 * exceljs 之类的重型依赖。
 */
import zlib from 'node:zlib';

/* ------------------------------------------------------------------ *
 * 1. 通用工具
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** 把 0 起的列号转成 A、B ... AA 形式 */
export function columnLetter(index) {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function escapeXml(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(value) {
  return String(value)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/* ------------------------------------------------------------------ *
 * 2. ZIP 容器
 * ------------------------------------------------------------------ */

function zipSync(entries) {
  const locals = [];
  const centrals = [];
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 文件名
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);

    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralSize = centrals.reduce((sum, buf) => sum + buf.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, ...centrals, end]);
}

function unzipSync(buffer) {
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error('文件不是有效的 xlsx（缺少 ZIP 结构）');

  const total = buffer.readUInt16LE(eocd + 10);
  let pointer = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let i = 0; i < total; i += 1) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) {
      throw new Error('xlsx 中央目录损坏');
    }
    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength);

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) entries.set(name, Buffer.from(raw));
    else if (method === 8) entries.set(name, zlib.inflateRawSync(raw));
    else throw new Error(`xlsx 使用了不支持的压缩方式：${method}`);

    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/* ------------------------------------------------------------------ *
 * 3. 写入
 * ------------------------------------------------------------------ */

function sanitizeSheetName(name) {
  const cleaned = String(name || 'Sheet1')
    .replace(/[\\/?*[\]:]/g, '')
    .trim();
  return (cleaned || 'Sheet1').slice(0, 31);
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><color rgb="FF1F2937"/><name val="等线"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="等线"/><family val="2"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

/**
 * 生成 xlsx 文件内容。
 * @param {{ sheetName?: string, columns: {header: string, width?: number, text?: boolean}[], rows: (string|number|boolean|null)[][] }} options
 * @returns {Buffer}
 */
export function writeXlsx({ sheetName = 'Sheet1', columns, rows }) {
  const headerRow = columns.map((column) => column.header);
  const dataRows = rows.map((row) => columns.map((_, index) => row[index] ?? ''));

  const cellXml = (ref, value, style) => {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
    }
    if (typeof value === 'boolean') {
      return `<c r="${ref}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
    }
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  };

  const sheetRowsXml = [];
  const headerCells = headerRow
    .map((value, index) => cellXml(`${columnLetter(index)}1`, value, 1))
    .join('');
  sheetRowsXml.push(`<row r="1" ht="30" customHeight="1">${headerCells}</row>`);

  dataRows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const cells = row
      .map((value, columnIndex) => {
        const style = columns[columnIndex].text ? 3 : 2;
        return cellXml(`${columnLetter(columnIndex)}${rowNumber}`, value, style);
      })
      .join('');
    sheetRowsXml.push(`<row r="${rowNumber}" ht="22" customHeight="1">${cells}</row>`);
  });

  const lastColumn = columnLetter(Math.max(columns.length - 1, 0));
  const lastRow = Math.max(dataRows.length + 1, 1);
  const dimension = `A1:${lastColumn}${lastRow}`;

  const colsXml = columns
    .map((column, index) => {
      const min = index + 1;
      const width = Number(column.width) > 0 ? Number(column.width) : 14;
      return `<col min="${min}" max="${min}" width="${width}" customWidth="1"/>`;
    })
    .join('');

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${dimension}"/>
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft" activeCell="A2" sqref="A2"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  <cols>${colsXml}</cols>
  <sheetData>${sheetRowsXml.join('')}</sheetData>
  <autoFilter ref="${dimension}"/>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;

  const files = [
    {
      name: '[Content_Types].xml',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
        'utf8',
      ),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
        'utf8',
      ),
    },
    {
      name: 'docProps/core.xml',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>轻contacts</dc:creator>
  <cp:lastModifiedBy>轻contacts</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`,
        'utf8',
      ),
    },
    {
      name: 'docProps/app.xml',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>轻contacts</Application>
</Properties>`,
        'utf8',
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="20000" windowHeight="12000"/></bookViews>
  <sheets><sheet name="${escapeXml(sanitizeSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
        'utf8',
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
        'utf8',
      ),
    },
    { name: 'xl/styles.xml', data: Buffer.from(buildStylesXml(), 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml, 'utf8') },
  ];

  return zipSync(files);
}

/* ------------------------------------------------------------------ *
 * 4. 读取
 * ------------------------------------------------------------------ */

function readSharedStrings(files) {
  const raw = files.get('xl/sharedStrings.xml');
  if (!raw) return [];
  const xml = raw.toString('utf8');
  const items = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = siRe.exec(xml))) {
    const texts = [];
    const textRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let textMatch;
    while ((textMatch = textRe.exec(match[1]))) texts.push(textMatch[1]);
    items.push(decodeXml(texts.join('')));
  }
  return items;
}

function findFirstSheetPath(files) {
  const workbook = files.get('xl/workbook.xml');
  if (workbook) {
    const sheetMatch = /<sheet\b[^>]*r:id="([^"]+)"/.exec(workbook.toString('utf8'));
    if (sheetMatch) {
      const rels = files.get('xl/_rels/workbook.xml.rels');
      if (rels) {
        const relRe = new RegExp(`<Relationship\\b[^>]*Id="${sheetMatch[1]}"[^>]*Target="([^"]+)"`);
        const relMatch = relRe.exec(rels.toString('utf8'));
        if (relMatch) {
          const target = relMatch[1].replace(/^\/?xl\//, '').replace(/^\//, '');
          const fullPath = `xl/${target}`;
          if (files.has(fullPath)) return fullPath;
        }
      }
    }
  }
  for (const name of files.keys()) {
    if (/^xl\/worksheets\/sheet\d*\.xml$/.test(name)) return name;
  }
  return null;
}

function columnIndexFromRef(ref) {
  const letters = /^([A-Z]+)/.exec(ref || '');
  if (!letters) return -1;
  let index = 0;
  for (const char of letters[1]) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

function cellText(attrs, inner, sharedStrings) {
  const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
  const valueMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner || '');
  const rawValue = valueMatch ? valueMatch[1] : '';

  if (type === 's') {
    const index = Number(rawValue);
    return Number.isInteger(index) ? (sharedStrings[index] ?? '') : '';
  }
  if (type === 'inlineStr') {
    const texts = [];
    const textRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let match;
    while ((match = textRe.exec(inner || ''))) texts.push(match[1]);
    return decodeXml(texts.join(''));
  }
  return decodeXml(rawValue);
}

function trimRows(rows) {
  const trimmed = rows.map((row) => {
    let end = row.length;
    while (end > 0 && (row[end - 1] === '' || row[end - 1] === undefined)) end -= 1;
    return row.slice(0, end);
  });
  while (trimmed.length > 0 && trimmed[trimmed.length - 1].every((cell) => cell === '')) {
    trimmed.pop();
  }
  return trimmed;
}

/**
 * 读取 xlsx 的第一个工作表。
 * @param {Buffer} buffer
 * @returns {{ rows: string[][] }} 单元格文本矩阵（已裁剪尾部空行空列）
 */
export function readXlsx(buffer) {
  const files = unzipSync(buffer);
  const sharedStrings = readSharedStrings(files);
  const sheetPath = findFirstSheetPath(files);
  if (!sheetPath) throw new Error('xlsx 中找不到工作表');
  const xml = files.get(sheetPath).toString('utf8');

  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(xml))) {
    const cells = [];
    const cellRe = /<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowMatch[1]))) {
      const attrs = cellMatch[2] !== undefined ? cellMatch[2] : cellMatch[1];
      const inner = cellMatch[3] || '';
      const refMatch = /\br="([A-Z]+)\d+"/.exec(attrs);
      const index = refMatch ? columnIndexFromRef(refMatch[1]) : cells.length;
      const text = cellText(attrs, inner, sharedStrings);
      if (index >= 0) {
        while (cells.length < index) cells.push('');
        cells[index] = text;
      }
    }
    rows.push(cells);
  }

  return { rows: trimRows(rows) };
}
