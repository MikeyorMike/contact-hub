/**
 * 应用装配：把路由、静态资源与统一异常处理组装成一个请求处理函数。
 * 与 server.js 分离，便于测试中直接挂到临时端口上。
 */
import { createRouter } from './router.js';
import { registerContactRoutes } from './routes/contacts.js';
import { registerExcelRoutes } from './routes/excel.js';
import { registerMetaRoutes } from './routes/meta.js';
import { createStaticHandler } from './static.js';
import { HttpError, sendJson } from './http.js';

export function createApp({ db, publicDir, version = '1.0.0', logRequests = false }) {
  const router = createRouter();
  registerContactRoutes(router, { db });
  registerExcelRoutes(router, { db });
  registerMetaRoutes(router, { db, version });

  const serveStatic = createStaticHandler(publicDir);

  return async function handleRequest(req, res) {
    const startedAt = Date.now();
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const matched = router.match(req.method, url.pathname);

      if (matched) {
        await matched.route.handler(req, res, matched.params, url);
      } else if (url.pathname.startsWith('/api/')) {
        throw new HttpError(404, `接口不存在：${req.method} ${url.pathname}`);
      } else if (req.method === 'GET' || req.method === 'HEAD') {
        await serveStatic(req, res, url.pathname);
      } else {
        throw new HttpError(405, '不支持的请求方法');
      }
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) console.error('[server] 未处理异常：', err);
      if (!res.headersSent) {
        sendJson(res, status, {
          error: {
            message: err instanceof HttpError ? err.message : '服务器内部错误',
            details: err instanceof HttpError ? err.details : undefined,
          },
        });
      }
    } finally {
      if (!res.writableEnded) res.end();
      if (logRequests) {
        console.log(
          `[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} ${Date.now() - startedAt}ms`,
        );
      }
    }
  };
}
