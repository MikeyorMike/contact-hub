/**
 * 自动化测试：接口 + Excel 模块
 * 运行：npm test（即 node tests/run-tests.js）
 *
 * 测试使用独立的临时数据库，不会影响 data/ 下的演示数据。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { readXlsx, writeXlsx } from '../src/lib/xlsx.js';
import { EXPORT_COLUMNS } from '../src/services/excel.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(rootDir, 'public');

let server;
let baseUrl;
let db;
let dataDir;

async function request(pathname, { method = 'GET', body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    if (Buffer.isBuffer(body) || body instanceof Uint8Array || typeof body === 'string') {
      init.body = body;
    } else {
      init.headers['Content-Type'] = 'application/json; charset=utf-8';
      init.body = JSON.stringify(body);
    }
  }
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('json') ? await response.json() : await response.arrayBuffer();
  return { status: response.status, payload, headers: response.headers };
}

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'contact-hub-test-'));
  db = openDatabase({ dataDir, seed: true });
  const app = createApp({ db, publicDir, version: 'test' });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  await rm(dataDir, { recursive: true, force: true });
});

test('首页与静态资源可访问', async () => {
  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  const html = await page.text();
  assert.match(html, /轻contacts/);

  const css = await fetch(`${baseUrl}/css/style.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
});

test('列表返回种子数据，且包含多种联系方式', async () => {
  const { status, payload } = await request('/api/contacts');
  assert.equal(status, 200);
  assert.ok(payload.items.length >= 12);
  const first = payload.items[0];
  assert.ok(first.name);
  assert.ok(Array.isArray(first.methods));
  assert.ok(first.methods.length > 0);
  assert.ok('starred' in first);
});

test('搜索支持姓名与手机号', async () => {
  const byName = await request('/api/contacts?q=' + encodeURIComponent('林清和'));
  assert.equal(byName.payload.items.length, 1);
  assert.equal(byName.payload.items[0].name, '林清和');

  const byPhone = await request('/api/contacts?q=13905910001');
  assert.ok(byPhone.payload.items.length >= 1);
});

test('收藏筛选只返回已收藏联系人', async () => {
  const { payload } = await request('/api/contacts?starred=1');
  assert.ok(payload.items.length > 0);
  assert.ok(payload.items.every((item) => item.starred === true));
});

test('新增联系人：支持多个手机号 / 邮箱 / 社交账号', async () => {
  const { status, payload } = await request('/api/contacts', {
    method: 'POST',
    body: {
      name: '测试同学',
      company: '福州大学',
      title: '软件工程',
      tags: '同学,测试',
      notes: '接口测试数据',
      starred: true,
      methods: [
        { type: 'phone', label: '手机', value: '137 0000 1111', primary: true },
        { type: 'phone', label: '家庭', value: '0591-2286 0000' },
        { type: 'email', label: '学校', value: 'test@fzu.edu.cn' },
        { type: 'wechat', value: 'test_wx' },
      ],
    },
  });

  assert.equal(status, 201);
  const contact = payload.contact;
  assert.equal(contact.name, '测试同学');
  assert.equal(contact.methods.length, 4);
  assert.deepEqual(contact.tags, ['同学', '测试']);
  assert.equal(contact.methods[0].primary, true);
  // 邮箱类型只有一个主要标记
  assert.equal(contact.methods.filter((method) => method.primary).length, 1);

  const detail = await request(`/api/contacts/${contact.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.payload.contact.methods.length, 4);

  globalThis.__testContactId = contact.id;
});

test('校验：姓名为空 / 邮箱格式错误 / 类型非法 都返回 422', async () => {
  const emptyName = await request('/api/contacts', { method: 'POST', body: { name: '  ', methods: [] } });
  assert.equal(emptyName.status, 422);
  assert.match(emptyName.payload.error.message, /姓名/);

  const badEmail = await request('/api/contacts', {
    method: 'POST',
    body: { name: '格式测试', methods: [{ type: 'email', value: 'not-an-email' }] },
  });
  assert.equal(badEmail.status, 422);
  assert.match(badEmail.payload.error.message, /邮箱/);

  const badType = await request('/api/contacts', {
    method: 'POST',
    body: { name: '格式测试', methods: [{ type: 'fax', value: '123' }] },
  });
  assert.equal(badType.status, 422);
});

test('收藏 / 取消收藏', async () => {
  const id = globalThis.__testContactId;
  const off = await request(`/api/contacts/${id}/star`, { method: 'PATCH', body: { starred: false } });
  assert.equal(off.status, 200);
  assert.equal(off.payload.contact.starred, false);

  const on = await request(`/api/contacts/${id}/star`, { method: 'PATCH', body: { starred: true } });
  assert.equal(on.payload.contact.starred, true);
});

test('编辑联系人会整体替换联系方式', async () => {
  const id = globalThis.__testContactId;
  const updated = await request(`/api/contacts/${id}`, {
    method: 'PUT',
    body: {
      name: '测试同学（已改）',
      company: '福州大学',
      methods: [{ type: 'email', label: '邮箱', value: 'updated@fzu.edu.cn', primary: true }],
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.payload.contact.name, '测试同学（已改）');
  assert.equal(updated.payload.contact.methods.length, 1);
  assert.equal(updated.payload.contact.methods[0].type, 'email');
});

test('导出 Excel：表头正确、行数与联系人数一致', async () => {
  const list = await request('/api/contacts');
  const response = await fetch(`${baseUrl}/api/export`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /spreadsheetml/);

  const buffer = Buffer.from(await response.arrayBuffer());
  assert.ok(buffer.length > 1000);
  assert.equal(buffer.subarray(0, 2).toString(), 'PK', 'xlsx 应是 ZIP 容器');

  const { rows } = readXlsx(buffer);
  assert.equal(rows[0].length, EXPORT_COLUMNS.length);
  assert.equal(rows[0][0], '姓名');
  assert.equal(rows[0][6], '手机');
  assert.equal(rows.length, list.payload.items.length + 1);

  const names = rows.slice(1).map((row) => row[0]);
  assert.ok(names.includes('林清和'));
});

test('导出模板只有表头', async () => {
  const response = await fetch(`${baseUrl}/api/export?template=1`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const { rows } = readXlsx(buffer);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], '姓名');
});

test('导入 Excel：新增、跳过重复、记录失败行', async () => {
  const before = await request('/api/contacts');
  const beforeCount = before.payload.items.length;

  const rows = [
    ['导入同学', '厦门大学', '研究生', '同学', '是', '来自 Excel', '136 0000 2222', '', 'import@xmu.edu.cn', '', 'import_wx', '', '', '', ''],
    ['林清和', '福州大学', '教授', '', '否', '重复数据', '139 0591 0001', '', '', '', '', '', '', '', ''],
    ['', '无名公司', '', '', '否', '', '135 0000 3333', '', '', '', '', '', '', '', ''],
  ];
  const workbook = writeXlsx({ sheetName: '通讯录', columns: EXPORT_COLUMNS, rows });

  const result = await request('/api/import', {
    method: 'POST',
    body: workbook,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'X-File-Name': encodeURIComponent('待导入.xlsx'),
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.total, 3);
  assert.equal(result.payload.added, 1);
  assert.equal(result.payload.skipped, 1);
  assert.equal(result.payload.failed, 1);
  assert.ok(result.payload.errors.some((item) => /缺少姓名/.test(item.reason)));

  const after = await request('/api/contacts');
  assert.equal(after.payload.items.length, beforeCount + 1);
  const imported = after.payload.items.find((item) => item.name === '导入同学');
  assert.ok(imported);
  assert.equal(imported.methods.filter((method) => method.type === 'phone').length, 1);
  assert.equal(imported.starred, true);
});

test('导入非 xlsx / 缺少姓名列会报错', async () => {
  const fake = await request('/api/import', {
    method: 'POST',
    body: Buffer.from('not an excel'),
    headers: { 'X-File-Name': 'bad.xlsx' },
  });
  assert.equal(fake.status, 422);

  const wrongHeader = writeXlsx({
    columns: [{ header: '公司' }, { header: '电话' }],
    rows: [['某公司', '123']],
  });
  const mismatch = await request('/api/import', {
    method: 'POST',
    body: wrongHeader,
    headers: { 'X-File-Name': 'wrong.xlsx' },
  });
  assert.equal(mismatch.status, 422);
  assert.match(mismatch.payload.error.message, /姓名/);
});

test('删除联系人', async () => {
  const id = globalThis.__testContactId;
  const removed = await request(`/api/contacts/${id}`, { method: 'DELETE' });
  assert.equal(removed.status, 204);

  const gone = await request(`/api/contacts/${id}`);
  assert.equal(gone.status, 404);
});

test('统计信息与未知接口', async () => {
  const { payload } = await request('/api/meta');
  assert.ok(payload.stats.total >= 12);
  assert.ok(Array.isArray(payload.stats.tags));
  assert.ok(payload.methodTypes.length >= 5);

  const missing = await request('/api/not-exists');
  assert.equal(missing.status, 404);
});

test('xlsx 模块：中文 / 换行 / emoji 往返一致', async () => {
  const columns = [
    { header: '姓名', width: 14 },
    { header: '手机', width: 18, text: true },
    { header: '备注', width: 30 },
    { header: '数量', width: 8 },
  ];
  const rows = [
    ['林清和', '139 0591 0001', '教授 <软件工程> & "测试"\n第二行 😀', 42],
    ['陈子墨', '13860012233', '换行\n与 Unicode：中文', 30],
  ];
  const buffer = writeXlsx({ sheetName: '联系人', columns, rows });
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');

  const { rows: parsed } = readXlsx(buffer);
  assert.equal(parsed[0][0], '姓名');
  assert.equal(parsed[1][0], '林清和');
  assert.equal(parsed[1][1], '139 0591 0001');
  assert.equal(parsed[1][2], '教授 <软件工程> & "测试"\n第二行 😀');
  assert.equal(parsed[1][3], '42');
  assert.equal(parsed[2][2], '换行\n与 Unicode：中文');
});

test('xlsx 模块：非法文件抛错', () => {
  assert.throws(() => readXlsx(Buffer.from('hello world')), /xlsx/);
});

test('静态资源目录穿越被拦截', async () => {
  const response = await fetch(`${baseUrl}/..%2f..%2fpackage.json`);
  assert.equal(response.status, 403);
});
