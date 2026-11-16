/**
 * 重建演示数据库：删除 data/ 下的数据库后重新写入种子数据。
 * 用法：node scripts/seed.js
 */
import { rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/db.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || path.join(rootDir, 'data');

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const file = path.join(dataDir, `contacts.db${suffix}`);
  if (existsSync(file)) rmSync(file);
}

const db = openDatabase({ dataDir, seed: true });
const { total, starred, methods } = db
  .prepare(
    `SELECT (SELECT COUNT(*) FROM contacts) AS total,
            (SELECT COUNT(*) FROM contacts WHERE starred = 1) AS starred,
            (SELECT COUNT(*) FROM contact_methods) AS methods`,
  )
  .get();
console.log(`已重建演示数据：联系人 ${total} 位，收藏 ${starred} 位，联系方式 ${methods} 条`);
db.close();
