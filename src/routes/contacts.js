/**
 * 联系人 REST 接口
 *
 *   GET    /api/contacts?q=&starred=&tag=&sort=   列表 / 搜索
 *   GET    /api/contacts/:id                      详情
 *   POST   /api/contacts                          新增
 *   PUT    /api/contacts/:id                      编辑
 *   DELETE /api/contacts/:id                      删除
 *   PATCH  /api/contacts/:id/star                 收藏 / 取消收藏
 */
import { HttpError, readJsonBody, sendEmpty, sendJson } from '../http.js';
import { createContactService } from '../services/contacts.js';

export function registerContactRoutes(router, { db }) {
  const service = createContactService(db);

  router.get('/api/contacts', (req, res, params, url) => {
    const items = service.list({
      q: url.searchParams.get('q') ?? '',
      starred: url.searchParams.get('starred') === '1' || url.searchParams.get('starred') === 'true',
      tag: url.searchParams.get('tag') ?? '',
      sort: url.searchParams.get('sort') ?? 'recent',
    });
    sendJson(res, 200, { items, total: items.length });
  });

  router.get('/api/contacts/:id', (req, res, { id }) => {
    const contact = service.get(id);
    if (!contact) throw new HttpError(404, '联系人不存在或已被删除');
    sendJson(res, 200, { contact });
  });

  router.post('/api/contacts', async (req, res) => {
    const payload = await readJsonBody(req);
    const contact = service.create(payload);
    sendJson(res, 201, { contact });
  });

  router.put('/api/contacts/:id', async (req, res, { id }) => {
    const payload = await readJsonBody(req);
    const contact = service.update(id, payload);
    if (!contact) throw new HttpError(404, '联系人不存在或已被删除');
    sendJson(res, 200, { contact });
  });

  router.patch('/api/contacts/:id/star', async (req, res, { id }) => {
    const payload = await readJsonBody(req);
    const existing = service.get(id);
    if (!existing) throw new HttpError(404, '联系人不存在或已被删除');
    const starred = payload.starred === undefined ? !existing.starred : payload.starred === true || payload.starred === 1;
    const contact = service.setStarred(id, starred);
    sendJson(res, 200, { contact });
  });

  router.delete('/api/contacts/:id', (req, res, { id }) => {
    const removed = service.remove(id);
    if (!removed) throw new HttpError(404, '联系人不存在或已被删除');
    sendEmpty(res, 204);
  });

  return service;
}
