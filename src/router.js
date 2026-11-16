/**
 * 极简路由：支持 :param 路径参数，按注册顺序匹配。
 * 设计思路与 Express 一致（method + path pattern -> handler），但零依赖。
 */

function compile(pattern) {
  const keys = [];
  const regexSource = pattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { keys, regex: new RegExp(`^${regexSource}/?$`) };
}

export function createRouter() {
  /** @type {{method:string, keys:string[], regex:RegExp, handler:Function}[]} */
  const routes = [];

  function add(method, pattern, handler) {
    routes.push({ method, ...compile(pattern), handler });
  }

  return {
    get: (pattern, handler) => add('GET', pattern, handler),
    post: (pattern, handler) => add('POST', pattern, handler),
    put: (pattern, handler) => add('PUT', pattern, handler),
    patch: (pattern, handler) => add('PATCH', pattern, handler),
    delete: (pattern, handler) => add('DELETE', pattern, handler),

    /**
     * @param {string} method
     * @param {string} pathname
     * @returns {{ route: object, params: Record<string,string> } | null}
     */
    match(method, pathname) {
      for (const route of routes) {
        if (route.method !== method) continue;
        const hit = route.regex.exec(pathname);
        if (!hit) continue;
        const params = {};
        route.keys.forEach((key, index) => {
          params[key] = decodeURIComponent(hit[index + 1]);
        });
        return { route, params };
      }
      return null;
    },
  };
}
