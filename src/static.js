/**
 * 静态资源托管：带缓存协商（ETag / Last-Modified）与目录穿越防护。
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './http.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

export function createStaticHandler(rootDir) {
  const resolvedRoot = path.resolve(rootDir);

  return async function serveStatic(req, res, pathname) {
    let relative = decodeURIComponent(pathname);
    if (relative === '/' || relative === '') relative = '/index.html';

    const filePath = path.resolve(resolvedRoot, `.${relative}`);
    if (!filePath.startsWith(resolvedRoot + path.sep) && filePath !== resolvedRoot) {
      throw new HttpError(403, '禁止访问该路径');
    }

    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      throw new HttpError(404, `资源不存在：${pathname}`);
    }
    if (!fileStat.isFile()) throw new HttpError(404, `资源不存在：${pathname}`);

    const etag = `W/"${fileStat.size.toString(16)}-${fileStat.mtimeMs.toString(16)}"`;
    const isFresh = req.headers['if-none-match'] === etag;
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const headers = {
      'Content-Type': contentType,
      ETag: etag,
      'Last-Modified': fileStat.mtime.toUTCString(),
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    };

    if (isFresh) {
      res.writeHead(304, headers);
      res.end();
      return;
    }

    headers['Content-Length'] = fileStat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(filePath).pipe(res);
  };
}
