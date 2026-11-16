/**
 * 联系人领域服务：校验、增删改查、收藏、标签统计。
 */
import { METHOD_TYPES } from '../db.js';
import { validationError } from '../http.js';

const LIMITS = {
  name: 40,
  company: 60,
  title: 60,
  tag: 20,
  tags: 10,
  notes: 500,
  methodLabel: 20,
  methodValue: 200,
  methods: 20,
};

const METHOD_LABELS = {
  phone: '手机',
  email: '邮箱',
  wechat: '微信',
  qq: 'QQ',
  weibo: '微博',
  address: '地址',
  other: '其他',
};

export { METHOD_LABELS };

function text(value, field, { max, required = false } = {}) {
  const raw = value === null || value === undefined ? '' : String(value);
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (required && cleaned === '') {
    throw validationError(`${field}不能为空`, [{ field, message: '必填' }]);
  }
  if (cleaned.length > max) {
    throw validationError(`${field}不能超过 ${max} 个字符`, [{ field, message: `最多 ${max} 字` }]);
  }
  return cleaned;
}

/** 标签既接受数组也接受逗号分隔字符串，统一存成 "a,b" */
function normalizeTags(value, field = '标签') {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[,，;；、/]/);
  const seen = new Set();
  const tags = [];
  for (const item of list) {
    const tag = String(item).replace(/\s+/g, ' ').trim();
    if (!tag) continue;
    if (tag.length > LIMITS.tag) {
      throw validationError(`单个${field}不能超过 ${LIMITS.tag} 个字符`, [{ field: 'tags', message: '标签过长' }]);
    }
    if (seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  if (tags.length > LIMITS.tags) {
    throw validationError(`最多只能设置 ${LIMITS.tags} 个标签`, [{ field: 'tags', message: '标签过多' }]);
  }
  return tags;
}

function normalizeMethods(input) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) {
    throw validationError('联系方式（methods）必须是数组', [{ field: 'methods', message: '格式错误' }]);
  }
  if (input.length > LIMITS.methods) {
    throw validationError(`一个联系人最多 ${LIMITS.methods} 条联系方式`, [
      { field: 'methods', message: '数量过多' },
    ]);
  }

  const methods = input.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw validationError(`第 ${index + 1} 条联系方式格式错误`, [
        { field: `methods[${index}]`, message: '格式错误' },
      ]);
    }
    const type = String(item.type ?? '').trim();
    if (!METHOD_TYPES.includes(type)) {
      throw validationError(`第 ${index + 1} 条联系方式的类型不支持：${type || '空'}`, [
        { field: `methods[${index}].type`, message: '类型不支持' },
      ]);
    }
    const value = text(item.value, '联系方式内容', { max: LIMITS.methodValue, required: true });
    if (type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw validationError(`邮箱格式不正确：${value}`, [{ field: `methods[${index}].value`, message: '邮箱格式不正确' }]);
    }
    const label = text(item.label, '方式备注', { max: LIMITS.methodLabel }) || METHOD_LABELS[type];
    return { type, label, value, isPrimary: item.primary === true || item.isPrimary === true };
  });

  // 每种类型最多保留一个“主要”，且默认把第一条设为主要
  const primaryTypes = new Set();
  for (const method of methods) {
    if (method.isPrimary && primaryTypes.has(method.type)) method.isPrimary = false;
    if (method.isPrimary) primaryTypes.add(method.type);
  }
  if (methods.length > 0 && !methods.some((method) => method.isPrimary)) {
    methods[0].isPrimary = true;
  }
  return methods;
}

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    title: row.title,
    tags: row.tags ? String(row.tags).split(',').filter(Boolean) : [],
    notes: row.notes,
    starred: row.starred === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMethod(row) {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    value: row.value,
    primary: row.is_primary === 1,
  };
}

export function createContactService(db) {
  const selectAll = db.prepare('SELECT * FROM contacts ORDER BY id');
  const selectById = db.prepare('SELECT * FROM contacts WHERE id = ?');
  const selectMethods = db.prepare('SELECT * FROM contact_methods WHERE contact_id = ? ORDER BY sort_order, id');
  const insertContact = db.prepare(
    `INSERT INTO contacts (name, company, title, tags, notes, starred, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateContactStmt = db.prepare(
    `UPDATE contacts SET name = ?, company = ?, title = ?, tags = ?, notes = ?, starred = ?, updated_at = ?
     WHERE id = ?`,
  );
  const deleteContactStmt = db.prepare('DELETE FROM contacts WHERE id = ?');
  const insertMethod = db.prepare(
    `INSERT INTO contact_methods (contact_id, type, label, value, is_primary, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const deleteMethods = db.prepare('DELETE FROM contact_methods WHERE contact_id = ?');

  function attachMethods(contacts) {
    if (contacts.length === 0) return contacts;
    const placeholders = contacts.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT * FROM contact_methods WHERE contact_id IN (${placeholders}) ORDER BY contact_id, sort_order, id`,
      )
      .all(...contacts.map((contact) => contact.id));
    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row.contact_id)) grouped.set(row.contact_id, []);
      grouped.get(row.contact_id).push(mapMethod(row));
    }
    return contacts.map((contact) => ({ ...contact, methods: grouped.get(contact.id) ?? [] }));
  }

  function get(id) {
    const row = selectById.get(Number(id));
    if (!row) return null;
    return attachMethods([mapRow(row)])[0];
  }

  function list({ q = '', starred = false, tag = '', sort = 'recent' } = {}) {
    const conditions = [];
    const params = [];

    const keyword = String(q).trim();
    if (keyword) {
      const like = `%${keyword}%`;
      const methodClauses = ['m.value LIKE ?'];
      params.push(like, like, like, like, like, like);

      // 号码搜索容错：允许用户输入 13905910001 匹配存储的 “139 0591 0001”
      const digits = keyword.replace(/\D/g, '');
      if (digits.length >= 3 && /^[\d\s()+.-]+$/.test(keyword)) {
        methodClauses.push(
          `REPLACE(REPLACE(REPLACE(REPLACE(m.value, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ?`,
        );
        params.push(`%${digits}%`);
      }

      conditions.push(
        `(c.name LIKE ? OR c.company LIKE ? OR c.title LIKE ? OR c.tags LIKE ? OR c.notes LIKE ?
          OR EXISTS (SELECT 1 FROM contact_methods m WHERE m.contact_id = c.id AND (${methodClauses.join(' OR ')})))`,
      );
    }
    if (starred) conditions.push('c.starred = 1');
    if (tag) {
      conditions.push(`(',' || c.tags || ',') LIKE ?`);
      params.push(`%,${String(tag).trim()},%`);
    }

    const orderBy =
      {
        name: 'c.name COLLATE NOCASE ASC, c.id ASC',
        recent: 'c.starred DESC, c.updated_at DESC, c.id DESC',
        starred: 'c.starred DESC, c.updated_at DESC',
      }[sort] ?? 'c.starred DESC, c.updated_at DESC, c.id DESC';

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT c.* FROM contacts c ${where} ORDER BY ${orderBy}`).all(...params);
    return attachMethods(rows.map(mapRow));
  }

  function all() {
    return attachMethods(selectAll.all().map(mapRow));
  }

  function insertMethods(contactId, methods) {
    methods.forEach((method, index) => {
      insertMethod.run(
        contactId,
        method.type,
        method.label,
        method.value,
        method.isPrimary ? 1 : 0,
        index,
      );
    });
  }

  function create(payload = {}) {
    const name = text(payload.name, '姓名', { max: LIMITS.name, required: true });
    const company = text(payload.company, '公司', { max: LIMITS.company });
    const title = text(payload.title, '职位', { max: LIMITS.title });
    const notes = text(payload.notes, '备注', { max: LIMITS.notes });
    const tags = normalizeTags(payload.tags);
    const methods = normalizeMethods(payload.methods);
    const starred = payload.starred === true || payload.starred === 1;

    const now = new Date().toISOString();
    db.exec('BEGIN');
    try {
      const result = insertContact.run(name, company, title, tags.join(','), notes, starred ? 1 : 0, now, now);
      const id = Number(result.lastInsertRowid);
      insertMethods(id, methods);
      db.exec('COMMIT');
      return get(id);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  function update(id, payload = {}) {
    const existing = get(id);
    if (!existing) return null;

    const name = text(payload.name ?? existing.name, '姓名', { max: LIMITS.name, required: true });
    const company = text(payload.company ?? existing.company, '公司', { max: LIMITS.company });
    const title = text(payload.title ?? existing.title, '职位', { max: LIMITS.title });
    const notes = text(payload.notes ?? existing.notes, '备注', { max: LIMITS.notes });
    const tags = payload.tags === undefined ? existing.tags : normalizeTags(payload.tags);
    const methods =
      payload.methods === undefined
        ? existing.methods.map((method) => ({
            type: method.type,
            label: method.label,
            value: method.value,
            isPrimary: method.primary,
          }))
        : normalizeMethods(payload.methods);
    const starred =
      payload.starred === undefined ? existing.starred : payload.starred === true || payload.starred === 1;
    const now = new Date().toISOString();

    db.exec('BEGIN');
    try {
      updateContactStmt.run(name, company, title, tags.join(','), notes, starred ? 1 : 0, now, Number(id));
      deleteMethods.run(Number(id));
      insertMethods(Number(id), methods);
      db.exec('COMMIT');
      return get(id);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  function remove(id) {
    const result = deleteContactStmt.run(Number(id));
    return result.changes > 0;
  }

  function setStarred(id, starred) {
    const existing = selectById.get(Number(id));
    if (!existing) return null;
    db.prepare('UPDATE contacts SET starred = ? WHERE id = ?').run(starred ? 1 : 0, Number(id));
    return get(id);
  }

  function stats() {
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM contacts').get();
    const { starred } = db.prepare('SELECT COUNT(*) AS starred FROM contacts WHERE starred = 1').get();
    const { methods } = db.prepare('SELECT COUNT(*) AS methods FROM contact_methods').get();
    const tagRows = db
      .prepare(`SELECT tags FROM contacts WHERE tags <> ''`)
      .all();
    const counter = new Map();
    for (const row of tagRows) {
      for (const tag of String(row.tags).split(',').filter(Boolean)) {
        counter.set(tag, (counter.get(tag) ?? 0) + 1);
      }
    }
    const tags = [...counter.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
    return { total, starred, methods, tags };
  }

  return { list, all, get, create, update, remove, setStarred, stats, normalizeTags, normalizeMethods };
}
