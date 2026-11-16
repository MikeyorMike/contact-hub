/**
 * 视图工具：转义、头像配色、图标、时间格式化、Toast。
 */

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);
}

/** 根据姓名稳定地挑选一组渐变色，保证同一个人每次颜色一致 */
const PALETTES = [
  ['#6366f1', '#8b5cf6'],
  ['#0ea5e9', '#22d3ee'],
  ['#f59e0b', '#f97316'],
  ['#10b981', '#34d399'],
  ['#ec4899', '#f43f5e'],
  ['#8b5cf6', '#d946ef'],
  ['#14b8a6', '#06b6d4'],
  ['#f43f5e', '#fb923c'],
];

export function avatarPalette(name) {
  let hash = 0;
  for (const char of String(name)) hash = (hash * 31 + char.codePointAt(0)) % 100000;
  const [a1, a2] = PALETTES[hash % PALETTES.length];
  return { a1, a2 };
}

export function initials(name) {
  const text = String(name ?? '').trim();
  if (!text) return '?';
  if (/^[\u4e00-\u9fa5]/.test(text)) return text.slice(0, 1);
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

const ICONS = {
  phone: '<path d="M7 3h2l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v2a2 2 0 0 1-2 2A16 16 0 0 1 5 5a2 2 0 0 1 2-2Z"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>',
  wechat: '<path d="M4 11a7 7 0 0 1 7-6.5c3.6 0 6.5 2.4 6.5 5.4S14.6 15.3 11 15.3c-.8 0-1.5-.1-2.2-.3L5 16.5l1-2.6A6.2 6.2 0 0 1 4 11Z"/><path d="M14.5 13.5c.4 2 2.4 3.5 4.8 3.5.6 0 1.2 0 1.7-.2l2 1-.8-2a4.6 4.6 0 0 0 1-3.3c-.3-1.9-2-3.3-4.1-3.3-1.9 0-3.6 1.2-4.2 2.9"/>',
  qq: '<path d="M12 3c3 0 5 2.4 5 5.6 0 1.6.5 2.6 1.5 4.1.8 1.2.5 2.8-.8 2.9-.8.1-1.6-.3-2.2-.9-.9.7-2.1 1.1-3.5 1.1s-2.6-.4-3.5-1.1c-.6.6-1.4 1-2.2.9-1.3-.1-1.6-1.7-.8-2.9C6.5 11.2 7 10.2 7 8.6 7 5.4 9 3 12 3Z"/>',
  weibo: '<path d="M10.5 19c-4 0-7.5-2-7.5-4.6 0-1.4.9-3 2.5-4.4C7.8 8 10.2 7.4 11.4 8c.6.3.6 1 .4 1.7 0 .2.2.1.3 0 1.3-.9 2.7-1.2 3.3-.4.3.4.2 1-.1 1.7-.1.2 0 .3.2.3 1 .3 1.6 1 1.6 1.9 0 1.7-2.2 3.8-6.6 4.8Z"/><path d="M14.5 6.5a4.5 4.5 0 0 1 5 4.2"/><path d="M15 3.5a8 8 0 0 1 7.2 6.8"/>',
  address: '<path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 1 0-13 0C5.5 15 12 21 12 21Z"/><circle cx="12" cy="10" r="2.5"/>',
  other: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.8v4.7M12 16h.01"/>',
  star: '<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 9.7l5.4-.8Z"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20c.8-3.4 3.3-5.2 7-5.2s6.2 1.8 7 5.2"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/>',
  edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14 6 4 4"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  alert: '<path d="M12 8v5m0 3.5h.01"/><circle cx="12" cy="12" r="9"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v11m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/>',
  upload: '<path d="M12 15V4m0 0 4 4m-4-4L8 8"/><path d="M5 19h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2m0 14v2M5.6 5.6 7 7m10 10 1.4 1.4M3 12h2m14 0h2M5.6 18.4 7 17m10-10 1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
};

export function icon(name, className = 'icon') {
  const body = ICONS[name] ?? ICONS.other;
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

export const METHOD_ICON = {
  phone: 'phone',
  email: 'email',
  wechat: 'wechat',
  qq: 'qq',
  weibo: 'weibo',
  address: 'address',
  other: 'other',
};

export function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 2 * day) return '昨天';
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function toast(message, tone = 'ok') {
  const host = document.getElementById('toastHost');
  if (!host) return;
  const node = document.createElement('div');
  node.className = 'toast';
  node.dataset.tone = tone;
  node.innerHTML = `${icon(tone === 'err' ? 'alert' : 'check')}<span>${escapeHtml(message)}</span>`;
  host.appendChild(node);
  while (host.children.length > 3) host.firstElementChild.remove();

  setTimeout(() => {
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 200);
  }, 2400);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  }
}
