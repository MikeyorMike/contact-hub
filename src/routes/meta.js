/**
 * 元信息接口：健康检查、统计、联系方式类型字典。
 */
import { sendJson } from '../http.js';
import { METHOD_LABELS, createContactService } from '../services/contacts.js';
import { METHOD_TYPES } from '../db.js';

export function registerMetaRoutes(router, { db, version }) {
  const service = createContactService(db);

  router.get('/api/health', (req, res) => {
    sendJson(res, 200, { status: 'ok', time: new Date().toISOString(), version });
  });

  router.get('/api/meta', (req, res) => {
    sendJson(res, 200, {
      version,
      methodTypes: METHOD_TYPES.map((type) => ({ type, label: METHOD_LABELS[type] })),
      stats: service.stats(),
    });
  });
}
