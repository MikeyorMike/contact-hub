/**
 * HTTP 基础设施：统一错误类型、JSON 输出、请求体读取。
 */

export class HttpError extends Error {
  /**
   * @param {number} status HTTP 状态码
   * @param {string} message 给前端展示的错误信息
   * @param {unknown} [details] 附加信息（例如字段级校验错误）
   */
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

/** 业务校验失败（422），details 中可携带字段级提示 */
export function validationError(message, details) {
  return new HttpError(422, message, details);
}

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

export function sendJson(res, status, payload, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    ...BASE_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

export function sendEmpty(res, status = 204) {
  res.writeHead(status, { ...BASE_HEADERS, 'Cache-Control': 'no-store' });
  res.end();
}

/**
 * 读取原始请求体，超过上限时抛出 413。
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [limitBytes]
 * @returns {Promise<Buffer>}
 */
export function readRawBody(req, limitBytes = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new HttpError(413, `上传内容过大，最大支持 ${Math.round(limitBytes / 1024 / 1024)}MB`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * 读取并解析 JSON 请求体，空体按 {} 处理。
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [limitBytes]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readJsonBody(req, limitBytes = 1024 * 1024) {
  const raw = await readRawBody(req, limitBytes);
  if (raw.length === 0) return {};
  try {
    const data = JSON.parse(raw.toString('utf8'));
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('请求体必须是 JSON 对象');
    }
    return data;
  } catch {
    throw new HttpError(400, '请求体不是合法的 JSON 对象');
  }
}
