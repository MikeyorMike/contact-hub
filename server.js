/**
 * 轻contacts 服务入口
 *
 * 启动方式：
 *   node server.js              # 默认 http://localhost:3000
 *   PORT=8080 node server.js    # 指定端口
 *
 * 说明：项目零第三方依赖，HTTP 层基于 Node 内置 node:http，数据库使用 Node 22.5+
 * 内置的 node:sqlite（真正的 SQLite 引擎，无需编译任何原生模块）。
 */
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { openDatabase } from './src/db.js';
import { createApp } from './src/app.js';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(rootDir, 'public');
const dataDir = process.env.DATA_DIR || path.join(rootDir, 'data');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const VERSION = '1.0.0';

const db = openDatabase({ dataDir });
const handler = createApp({
  db,
  publicDir,
  version: VERSION,
  logRequests: process.env.LOG_REQUESTS !== '0',
});

const server = createServer(handler);

server.listen(PORT, HOST, () => {
  const shownHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`轻contacts 已启动： http://${shownHost}:${PORT}`);
  console.log(`数据库文件： ${path.join(dataDir, 'contacts.db')}`);
});

function shutdown(signal) {
  console.log(`\n收到 ${signal}，正在关闭服务...`);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
