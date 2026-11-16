/**
 * Excel 导入导出接口
 *
 *   GET  /api/export      下载全量通讯录（.xlsx）
 *   POST /api/import      上传 .xlsx（原始二进制请求体），返回导入报告
 *
 * 导入没有使用 multipart/form-data，而是直接把文件字节作为请求体、文件名放在
 * X-File-Name 头里，前端用 fetch 发送一遍即可，服务端也不需要解析 multipart。
 */
import { HttpError, readRawBody, sendJson } from '../http.js';
import { createContactService } from '../services/contacts.js';
import { EXPORT_COLUMNS, buildExportRows, importContacts } from '../services/excel.js';
import { readXlsx, writeXlsx } from '../lib/xlsx.js';

const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

function downloadFileName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `通讯录导出_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`;
}

export function registerExcelRoutes(router, { db }) {
  const service = createContactService(db);

  router.get('/api/export', (req, res, params, url) => {
    const templateOnly = url?.searchParams.get('template') === '1';
    const contacts = service.all();
    const rows = templateOnly ? [] : buildExportRows(contacts);
    const buffer = writeXlsx({
      sheetName: templateOnly ? '导入模板' : '通讯录',
      columns: EXPORT_COLUMNS,
      rows,
    });
    const fileName = templateOnly ? '通讯录导入模板.xlsx' : downloadFileName();

    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Length': buffer.length,
      'Content-Disposition': `attachment; filename="contacts.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Export-Rows': String(rows.length),
    });
    res.end(buffer);
  });

  router.post('/api/import', async (req, res) => {
    const rawName = req.headers['x-file-name'];
    let fileName = 'import.xlsx';
    if (typeof rawName === 'string' && rawName.trim() !== '') {
      try {
        fileName = decodeURIComponent(rawName);
      } catch {
        fileName = rawName;
      }
    }

    if (!/\.xlsx$/i.test(fileName)) {
      throw new HttpError(422, '仅支持 .xlsx 格式的 Excel 文件（可先使用“导出”生成模板）');
    }

    const body = await readRawBody(req, MAX_IMPORT_BYTES);
    if (body.length === 0) {
      throw new HttpError(400, '上传文件为空，请重新选择');
    }

    let rows;
    try {
      ({ rows } = readXlsx(body));
    } catch (err) {
      throw new HttpError(422, `无法解析该 Excel 文件：${err?.message ?? '格式错误'}`);
    }

    const result = importContacts(rows, service);
    sendJson(res, 200, { ...result, fileName, stats: service.stats() });
  });
}
