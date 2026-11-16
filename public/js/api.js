/**
 * 后端接口封装：统一错误处理，页面只关心数据。
 */

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    if (body instanceof Blob) {
      init.body = body;
    } else {
      init.headers['Content-Type'] = 'application/json; charset=utf-8';
      init.body = JSON.stringify(body);
    }
  }

  const response = await fetch(path, init);
  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(data?.error?.message || `请求失败（HTTP ${response.status}）`);
    error.status = response.status;
    error.details = data?.error?.details;
    throw error;
  }
  return data;
}

export const api = {
  listContacts({ q = '', starred = false, tag = '', sort = 'recent' } = {}) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (starred) params.set('starred', '1');
    if (tag) params.set('tag', tag);
    params.set('sort', sort);
    return request(`/api/contacts?${params.toString()}`);
  },

  getContact(id) {
    return request(`/api/contacts/${id}`);
  },

  createContact(payload) {
    return request('/api/contacts', { method: 'POST', body: payload });
  },

  updateContact(id, payload) {
    return request(`/api/contacts/${id}`, { method: 'PUT', body: payload });
  },

  deleteContact(id) {
    return request(`/api/contacts/${id}`, { method: 'DELETE' });
  },

  setStarred(id, starred) {
    return request(`/api/contacts/${id}/star`, { method: 'PATCH', body: { starred } });
  },

  meta() {
    return request('/api/meta');
  },

  async importFile(file) {
    const response = await fetch('/api/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'X-File-Name': encodeURIComponent(file.name),
      },
      body: file,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.error?.message || `导入失败（HTTP ${response.status}）`);
      error.status = response.status;
      throw error;
    }
    return data;
  },

  exportUrl({ template = false } = {}) {
    return template ? '/api/export?template=1' : '/api/export';
  },
};
