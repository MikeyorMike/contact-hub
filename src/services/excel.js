/**
 * Excel 导入导出服务
 *
 * 导出格式：一个联系人一行，每一类信息一列（手机/邮箱各支持两列，便于常见场景）。
 * 导入格式：以上表头为模板，支持别名与多列扩展（如“手机1/手机2”），逐行校验，
 *          重复联系人（姓名 + 首个手机号/邮箱相同）跳过并记录原因。
 */
import { validationError } from '../http.js';

/** 导出列定义：width 控制列宽，text 表示按文本格式存储（保留手机号前导 0） */
export const EXPORT_COLUMNS = [
  { header: '姓名', width: 12 },
  { header: '公司', width: 20 },
  { header: '职位', width: 20 },
  { header: '标签', width: 16 },
  { header: '收藏', width: 8 },
  { header: '备注', width: 34 },
  { header: '手机', width: 18, text: true },
  { header: '手机(备用)', width: 18, text: true },
  { header: '邮箱', width: 26 },
  { header: '邮箱(备用)', width: 26 },
  { header: '微信', width: 16 },
  { header: 'QQ', width: 16, text: true },
  { header: '微博', width: 22 },
  { header: '地址', width: 32 },
  { header: '其他', width: 22 },
];

const FIELD_ALIASES = {
  name: ['姓名', '名字', '联系人', '名称', 'name', 'contact', 'contactname'],
  company: ['公司', '单位', '组织', '公司名称', 'company', 'organization', 'org'],
  title: ['职位', '职务', '头衔', '岗位', 'title', 'position', 'job'],
  tags: ['标签', '分组', '分类', 'tags', 'tag', 'group', 'groups'],
  starred: ['收藏', '星标', '关注', 'starred', 'star', 'favorite', 'favourite'],
  notes: ['备注', '说明', 'note', 'notes', 'remark', 'comment'],
  phone: ['手机', '电话', '手机号', '手机号码', '联系电话', '号码', 'phone', 'mobile', 'tel', 'telephone', 'cell'],
  email: ['邮箱', '邮件', '电子邮箱', 'email', 'mail'],
  wechat: ['微信', '微信号', 'wechat', 'weixin'],
  qq: ['qq', 'qq号'],
  weibo: ['微博', 'weibo'],
  address: ['地址', '住址', '通讯地址', 'address', 'addr'],
  other: ['其他', '其它', 'other', 'extra'],
};

const ALIAS_TO_FIELD = new Map();
for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
  for (const alias of aliases) ALIAS_TO_FIELD.set(alias, field);
}

/** 归一化表头：去括号注释、空白、标点与末尾序号，便于匹配别名 */
export function normalizeHeader(raw) {
  return String(raw ?? '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[*:：_\-—.、]/g, '')
    .replace(/\d+$/, '')
    .toLowerCase();
}

function splitList(value) {
  return String(value ?? '')
    .split(/[、;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isTruthy(value) {
  const token = String(value ?? '').trim().toLowerCase();
  return ['是', '1', 'true', 'yes', 'y', '√', '✓', '收藏', '已收藏'].includes(token);
}

/** 把联系人数组拍平成导出行 */
export function buildExportRows(contacts) {
  return contacts.map((contact) => {
    const byType = (type) => contact.methods.filter((method) => method.type === type);
    const phones = byType('phone');
    const emails = byType('email');
    const join = (type, separator = '、') => byType(type).map((method) => method.value).join(separator);

    return [
      contact.name,
      contact.company,
      contact.title,
      contact.tags.join('，'),
      contact.starred ? '是' : '否',
      contact.notes,
      phones[0]?.value ?? '',
      phones[1]?.value ?? '',
      emails[0]?.value ?? '',
      emails[1]?.value ?? '',
      join('wechat'),
      join('qq'),
      join('weibo'),
      join('address', '；'),
      join('other'),
    ];
  });
}

/** 根据表头解析列位置，同名多列（手机1、手机2）会各自保留 */
function resolveColumns(headerRow) {
  const columns = [];
  headerRow.forEach((raw, index) => {
    const field = ALIAS_TO_FIELD.get(normalizeHeader(raw));
    if (field) columns.push({ field, index });
  });
  return columns;
}

function phoneDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * 导入：把解析后的行写入数据库。
 * @param {string[][]} rows readXlsx 得到的二维文本数组
 * @param {ReturnType<import('./contacts.js').createContactService>} contactsService
 */
export function importContacts(rows, contactsService) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw validationError('Excel 内容为空，请检查文件');
  }
  if (rows.length > 2001) {
    throw validationError(`单次最多导入 2000 条记录，当前文件有 ${rows.length - 1} 行数据`);
  }

  const headerRow = rows[0];
  const columns = resolveColumns(headerRow);
  const hasName = columns.some((column) => column.field === 'name');
  if (!hasName) {
    throw validationError('Excel 中缺少“姓名”列，请参照导出的模板表头');
  }

  // 已存在联系人指纹：姓名 + 手机号 / 邮箱，用于去重
  const fingerprints = new Set();
  const addFingerprint = (name, methods) => {
    const normalizedName = String(name).replace(/\s+/g, '').toLowerCase();
    const phone = methods.find((method) => method.type === 'phone')?.value;
    const email = methods.find((method) => method.type === 'email')?.value;
    fingerprints.add(`${normalizedName}|${phoneDigits(phone)}`);
    fingerprints.add(`${normalizedName}|${String(email ?? '').trim().toLowerCase()}`);
  };
  for (const contact of contactsService.all()) addFingerprint(contact.name, contact.methods);

  const result = {
    total: 0,
    added: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const excelRow = rowIndex + 1;
    if (!row || row.every((cell) => String(cell ?? '').trim() === '')) continue;
    // 有些表格会在数据中间重复表头（复制粘贴常见），直接跳过
    if (row.slice(0, headerRow.length).every((cell, index) => String(cell ?? '') === String(headerRow[index] ?? ''))) {
      continue;
    }
    result.total += 1;

    const record = { name: '', company: '', title: '', tags: '', notes: '', starred: false, methods: [] };
    try {
      for (const { field, index } of columns) {
        const cell = String(row[index] ?? '').trim();
        if (cell === '') continue;

        if (field === 'phone' || field === 'email') {
          const values = splitList(cell);
          values.forEach((value, valueIndex) => {
            record.methods.push({
              type: field,
              label: field === 'phone' ? (valueIndex === 0 ? '手机' : '备用') : valueIndex === 0 ? '邮箱' : '备用',
              value,
            });
          });
        } else if (['wechat', 'qq', 'weibo', 'address', 'other'].includes(field)) {
          const values = field === 'address' ? [cell] : splitList(cell);
          values.forEach((value) => {
            record.methods.push({ type: field, label: '', value });
          });
        } else if (field === 'starred') {
          record.starred = isTruthy(cell);
        } else if (field === 'tags') {
          record.tags = cell;
        } else {
          record[field] = cell;
        }
      }

      if (!record.name) {
        throw new Error('缺少姓名');
      }

      const normalizedName = record.name.replace(/\s+/g, '').toLowerCase();
      const phone = record.methods.find((method) => method.type === 'phone')?.value;
      const email = record.methods.find((method) => method.type === 'email')?.value;
      const phoneKey = `${normalizedName}|${phoneDigits(phone)}`;
      const emailKey = `${normalizedName}|${String(email ?? '').trim().toLowerCase()}`;
      if (fingerprints.has(phoneKey) || (email && fingerprints.has(emailKey))) {
        result.skipped += 1;
        result.errors.push({ row: excelRow, name: record.name, reason: '已存在相同姓名与手机号/邮箱，已跳过' });
        continue;
      }

      contactsService.create(record);
      addFingerprint(record.name, record.methods);
      result.added += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push({
        row: excelRow,
        name: record.name || '（未填写）',
        reason: err?.message ?? '未知错误',
      });
    }
  }

  return result;
}
