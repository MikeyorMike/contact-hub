/**
 * 数据层：SQLite（Node 内置 node:sqlite，无需编译原生模块）
 *
 * 表结构：
 *   contacts         联系人主表（姓名、公司、职位、标签、备注、收藏标记）
 *   contact_methods  联系方式子表（一个联系人可挂多条：手机/邮箱/微信/QQ/微博/地址/其他）
 *
 * 选择「主表 + 子表」而不是把电话塞进 JSON 字段，是为了让一个联系人可以关联
 * 任意数量的联系方式，同时便于按类型统计与后续扩展。
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { seedContacts } from './seed-data.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS contacts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  company     TEXT    NOT NULL DEFAULT '',
  title       TEXT    NOT NULL DEFAULT '',
  tags        TEXT    NOT NULL DEFAULT '',
  notes       TEXT    NOT NULL DEFAULT '',
  starred     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_methods (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL,
  label       TEXT    NOT NULL DEFAULT '',
  value       TEXT    NOT NULL,
  is_primary  INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_methods_contact ON contact_methods(contact_id);
CREATE INDEX IF NOT EXISTS idx_contacts_starred ON contacts(starred);
CREATE INDEX IF NOT EXISTS idx_contacts_updated ON contacts(updated_at);
`;

export const METHOD_TYPES = ['phone', 'email', 'wechat', 'qq', 'weibo', 'address', 'other'];

/**
 * 打开（必要时初始化）数据库。
 * @param {{ dataDir: string, seed?: boolean }} options
 */
export function openDatabase({ dataDir, seed = true }) {
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'contacts.db');
  const db = new DatabaseSync(file);

  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

  const { count } = db.prepare('SELECT COUNT(*) AS count FROM contacts').get();
  if (seed && count === 0) {
    insertSeed(db);
  }

  return db;
}

function insertSeed(db) {
  const now = Date.now();
  const insertContact = db.prepare(
    `INSERT INTO contacts (name, company, title, tags, notes, starred, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertMethod = db.prepare(
    `INSERT INTO contact_methods (contact_id, type, label, value, is_primary, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  db.exec('BEGIN');
  try {
    seedContacts.forEach((contact, index) => {
      // 让种子数据的时间戳错开，列表排序看起来更真实
      const updatedAt = new Date(now - index * 36 * 60 * 60 * 1000).toISOString();
      const createdAt = new Date(now - (index + 3) * 72 * 60 * 60 * 1000).toISOString();
      const result = insertContact.run(
        contact.name,
        contact.company,
        contact.title,
        contact.tags,
        contact.notes,
        contact.starred ? 1 : 0,
        createdAt,
        updatedAt,
      );
      const contactId = Number(result.lastInsertRowid);
      contact.methods.forEach((method, methodIndex) => {
        insertMethod.run(
          contactId,
          method.type,
          method.label || '',
          method.value,
          method.primary ? 1 : 0,
          methodIndex,
        );
      });
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
