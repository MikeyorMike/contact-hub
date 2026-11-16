/**
 * 页面逻辑：状态管理 → 渲染 → 事件绑定。
 *
 * 数据流：state 是唯一数据源；所有写操作调用 api 后重新拉取列表与统计，
 * 保证多标签页 / 多设备下看到的数据一致。
 */
import { api } from './api.js';
import {
  METHOD_ICON,
  avatarPalette,
  copyText,
  escapeHtml,
  formatDate,
  icon,
  initials,
  toast,
} from './ui.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const el = {
  searchInput: $('#searchInput'),
  themeToggle: $('#themeToggle'),
  importBtn: $('#importBtn'),
  exportBtn: $('#exportBtn'),
  newBtn: $('#newBtn'),
  countAll: $('#countAll'),
  countStarred: $('#countStarred'),
  tagList: $('#tagList'),
  statTotal: $('#statTotal'),
  statStarred: $('#statStarred'),
  statMethods: $('#statMethods'),
  listTitle: $('#listTitle'),
  listSubtitle: $('#listSubtitle'),
  sortSelect: $('#sortSelect'),
  contactList: $('#contactList'),
  emptyState: $('#emptyState'),
  emptyTitle: $('#emptyTitle'),
  emptyText: $('#emptyText'),
  detailPane: $('#detailPane'),
  formModal: $('#formModal'),
  contactForm: $('#contactForm'),
  formTitle: $('#formTitle'),
  formSubtitle: $('#formSubtitle'),
  fieldName: $('#fieldName'),
  fieldCompany: $('#fieldCompany'),
  fieldTitle: $('#fieldTitle'),
  fieldTags: $('#fieldTags'),
  fieldNotes: $('#fieldNotes'),
  fieldStarred: $('#fieldStarred'),
  methodEditor: $('#methodEditor'),
  addMethodBtn: $('#addMethodBtn'),
  saveBtn: $('#saveBtn'),
  importModal: $('#importModal'),
  dropzone: $('#dropzone'),
  fileInput: $('#fileInput'),
  importProgress: $('#importProgress'),
  importResult: $('#importResult'),
  confirmModal: $('#confirmModal'),
  confirmText: $('#confirmText'),
  confirmDeleteBtn: $('#confirmDeleteBtn'),
};

const state = {
  items: [],
  stats: { total: 0, starred: 0, methods: 0, tags: [] },
  methodTypes: [],
  view: 'all', // all | starred | tag
  tag: '',
  query: '',
  sort: 'recent',
  selectedId: null,
  editingId: null,
  deletingId: null,
  formMethods: [],
};

const TYPE_PLACEHOLDER = {
  phone: '139 0000 0000',
  email: 'name@example.com',
  wechat: '微信号',
  qq: 'QQ 号',
  weibo: '@微博昵称',
  address: '详细地址',
  other: '内容',
};

const TYPE_LABEL = {
  phone: '手机',
  email: '邮箱',
  wechat: '微信',
  qq: 'QQ',
  weibo: '微博',
  address: '地址',
  other: '其他',
};

/* ------------------------------------------------------------------ *
 * 主题
 * ------------------------------------------------------------------ */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('contact-hub-theme', theme);
  } catch {
    /* 隐私模式下忽略 */
  }
  $$('[data-theme-icon]').forEach((node) => {
    node.hidden = node.dataset.themeIcon !== theme;
  });
}

function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem('contact-hub-theme');
  } catch {
    /* ignore */
  }
  const preferred = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved === 'dark' || saved === 'light' ? saved : preferred);
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

const findContact = (id) => state.items.find((contact) => contact.id === Number(id)) ?? null;

function primaryMethod(contact, type) {
  return contact.methods.find((method) => method.type === type && method.primary)
    ?? contact.methods.find((method) => method.type === type);
}

function renderStats() {
  el.countAll.textContent = String(state.stats.total);
  el.countStarred.textContent = String(state.stats.starred);
  el.statTotal.textContent = String(state.stats.total);
  el.statStarred.textContent = String(state.stats.starred);
  el.statMethods.textContent = String(state.stats.methods);
}

function renderTags() {
  const tags = state.stats.tags ?? [];
  if (tags.length === 0) {
    el.tagList.innerHTML = '<span class="tip">暂无标签</span>';
    return;
  }
  el.tagList.innerHTML = tags
    .map(
      (tag) => `<button class="tag-chip ${state.view === 'tag' && state.tag === tag.name ? 'is-active' : ''}"
        type="button" data-tag="${escapeHtml(tag.name)}">${escapeHtml(tag.name)}<span class="tag-count">${tag.count}</span></button>`,
    )
    .join('');
}

function syncNav() {
  $$('.nav-item').forEach((node) => {
    node.classList.toggle('is-active', node.dataset.view === state.view && state.view !== 'tag');
    if (state.view === 'tag' && node.dataset.view === 'all') node.classList.remove('is-active');
  });
}

function headerText() {
  let title = state.view === 'starred' ? '收藏夹' : '全部联系人';
  if (state.view === 'tag') title = `标签 · ${state.tag}`;
  if (state.query) title = `搜索 “${state.query}”`;
  const count = state.items.length;
  let subtitle = `共 ${count} 位联系人`;
  if (state.query) subtitle = `「${state.query}」匹配到 ${count} 位联系人`;
  else if (state.view === 'starred') subtitle = `收藏的 ${count} 位重要联系人`;
  else if (state.view === 'tag') subtitle = `标签「${state.tag}」下共 ${count} 位`;
  return { title, subtitle };
}

function contactCard(contact) {
  const { a1, a2 } = avatarPalette(contact.name);
  const meta = [contact.company, contact.title].filter(Boolean).join(' · ');
  const phone = primaryMethod(contact, 'phone')?.value ?? '';
  const tags = contact.tags.slice(0, 3);
  const selected = contact.id === state.selectedId;

  return `
    <div class="contact-card ${selected ? 'is-selected' : ''}" data-id="${contact.id}" role="button" tabindex="0"
         aria-label="${escapeHtml(contact.name)}${contact.company ? `，${escapeHtml(contact.company)}` : ''}">
      <span class="avatar" style="--a1:${a1};--a2:${a2}">${escapeHtml(initials(contact.name))}</span>
      <div class="card-main">
        <div class="card-name">
          ${escapeHtml(contact.name)}
          ${contact.starred ? icon('star', 'card-star') : ''}
        </div>
        <div class="card-meta">${meta ? escapeHtml(meta) : '暂无公司 / 职位信息'}</div>
        ${tags.length ? `<div class="card-tags">${tags.map((tag) => `<span class="mini-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="card-side">
        ${phone ? `<span class="card-phone">${escapeHtml(phone)}</span>` : ''}
        <button class="star-btn ${contact.starred ? 'is-starred' : ''}" type="button" data-star="${contact.id}"
          aria-pressed="${contact.starred}" aria-label="${contact.starred ? '取消收藏' : '收藏'}"
          title="${contact.starred ? '取消收藏' : '收藏'}">${icon('star')}</button>
      </div>
    </div>`;
}

function renderList() {
  const { title, subtitle } = headerText();
  el.listTitle.textContent = title;
  el.listSubtitle.textContent = subtitle;
  el.sortSelect.value = state.sort;

  const hasItems = state.items.length > 0;
  el.contactList.classList.toggle('is-hidden', !hasItems);
  el.emptyState.classList.toggle('is-hidden', hasItems);

  if (!hasItems) {
    const filtered = Boolean(state.query) || state.view === 'starred' || state.view === 'tag';
    el.emptyTitle.textContent = filtered ? '没有匹配的联系人' : '还没有联系人';
    el.emptyText.textContent = filtered
      ? '换个关键词，或清除筛选条件再看看。'
      : '点击右上角「新建联系人」，或从 Excel 批量导入。';
    const btn = el.emptyState.querySelector('[data-action]');
    if (btn) {
      btn.dataset.action = filtered ? 'clear-filter' : 'new';
      btn.innerHTML = filtered
        ? `${icon('close')}清除筛选`
        : `${icon('plus')}新建联系人`;
    }
    el.contactList.innerHTML = '';
    return;
  }

  el.contactList.innerHTML = state.items.map(contactCard).join('');
}

function methodRowHtml(method, index) {
  const placeholder = TYPE_PLACEHOLDER[method.type] ?? '内容';
  const options = (state.methodTypes.length ? state.methodTypes : Object.keys(TYPE_LABEL).map((type) => ({ type, label: TYPE_LABEL[type] })))
    .map((item) => `<option value="${item.type}" ${item.type === method.type ? 'selected' : ''}>${item.label}</option>`)
    .join('');

  return `
    <div class="method-row" data-index="${index}">
      <select class="method-type" aria-label="联系方式类型">${options}</select>
      <input class="method-label" type="text" maxlength="20" placeholder="备注" value="${escapeHtml(method.label)}" aria-label="备注" />
      <input class="method-value-input" type="text" maxlength="200" placeholder="${placeholder}" value="${escapeHtml(method.value)}" aria-label="${TYPE_LABEL[method.type] ?? '内容'}" />
      <button type="button" class="primary-toggle ${method.primary ? 'is-primary' : ''}" title="设为主要联系方式" aria-pressed="${method.primary}">${icon('star')}</button>
      <button type="button" class="remove-method" title="删除该联系方式" aria-label="删除该联系方式">${icon('trash')}</button>
    </div>`;
}

function renderMethodRows() {
  el.methodEditor.innerHTML = state.formMethods.map(methodRowHtml).join('');
  if (state.formMethods.length === 0) {
    el.methodEditor.innerHTML = '<p class="form-hint">还没有联系方式，点击下方按钮添加手机号、邮箱或社交账号。</p>';
  }
}

function methodItem(method) {
  const mono = method.type === 'phone' || method.type === 'qq';
  return `
    <div class="method-item">
      <span class="method-icon" data-type="${method.type}">${icon(METHOD_ICON[method.type] ?? 'other')}</span>
      <div class="method-body">
        <div class="method-label">
          ${escapeHtml(method.label || TYPE_LABEL[method.type] || '')}
          ${method.primary ? '<span class="badge-primary">主要</span>' : ''}
        </div>
        <div class="method-value ${mono ? 'is-mono' : ''}" title="${escapeHtml(method.value)}">${escapeHtml(method.value)}</div>
      </div>
      <button class="copy-btn" type="button" data-action="copy" data-copy="${escapeHtml(method.value)}" title="复制" aria-label="复制">${icon('copy')}</button>
    </div>`;
}

function renderDetail() {
  const contact = findContact(state.selectedId);
  if (!contact) {
    el.detailPane.innerHTML = `
      <div class="detail-empty">
        ${icon('user')}
        <strong>选择一位联系人查看详情</strong>
        <p>收藏重要的人，给每个联系人添加手机、邮箱、微信等多种联系方式，还能一键导出 Excel。</p>
      </div>`;
    el.detailPane.classList.remove('is-open');
    return;
  }

  const { a1, a2 } = avatarPalette(contact.name);
  const meta = [contact.company, contact.title].filter(Boolean).join(' · ');

  el.detailPane.innerHTML = `
    <button class="detail-back" type="button" data-action="close-detail">${icon('back')}返回列表</button>
    <div class="detail-banner">
      <div class="detail-head">
        <span class="avatar avatar-lg" style="--a1:${a1};--a2:${a2}">${escapeHtml(initials(contact.name))}</span>
        <div class="detail-identity">
          <div class="detail-name">
            ${escapeHtml(contact.name)}
            ${contact.starred ? '<span class="detail-star">已收藏</span>' : ''}
          </div>
          <div class="detail-sub">${meta ? escapeHtml(meta) : '暂无公司 / 职位信息'}</div>
          ${contact.tags.length ? `<div class="detail-tags">${contact.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="detail-actions">
          <button class="icon-btn" type="button" data-action="star" title="${contact.starred ? '取消收藏' : '加入收藏'}" aria-label="${contact.starred ? '取消收藏' : '加入收藏'}" style="color:${contact.starred ? 'var(--gold)' : 'var(--muted)'}">
            ${icon('star')}
          </button>
          <button class="icon-btn" type="button" data-action="edit" title="编辑" aria-label="编辑">${icon('edit')}</button>
          <button class="icon-btn" type="button" data-action="delete" title="删除" aria-label="删除">${icon('trash')}</button>
        </div>
      </div>
    </div>

    <section class="detail-section">
      <div class="section-head">
        <h3>联系方式</h3>
        <span>共 ${contact.methods.length} 条</span>
      </div>
      <div class="method-list">
        ${contact.methods.length ? contact.methods.map(methodItem).join('') : '<p class="form-hint">这个联系人还没有填写联系方式。</p>'}
      </div>
    </section>

    ${
      contact.notes
        ? `<section class="detail-section">
            <div class="section-head"><h3>备注</h3></div>
            <div class="notes-card">${escapeHtml(contact.notes)}</div>
          </section>`
        : ''
    }

    <div class="meta-line">
      <span>创建于 <strong>${formatDate(contact.createdAt)}</strong></span>
      <span>更新于 <strong>${formatDate(contact.updatedAt)}</strong></span>
      <span>编号 <strong>#${contact.id}</strong></span>
    </div>`;
}

function render() {
  renderStats();
  renderTags();
  renderList();
  renderDetail();
  syncNav();
}

/* ------------------------------------------------------------------ *
 * 数据加载
 * ------------------------------------------------------------------ */

async function load({ preserveSelection = true } = {}) {
  const [meta, list] = await Promise.all([
    api.meta(),
    api.listContacts({
      q: state.query,
      starred: state.view === 'starred',
      tag: state.view === 'tag' ? state.tag : '',
      sort: state.sort,
    }),
  ]);

  state.stats = meta.stats;
  state.methodTypes = meta.methodTypes;
  state.items = list.items;

  if (!preserveSelection || !findContact(state.selectedId)) {
    state.selectedId = state.items[0]?.id ?? null;
  }
  render();
}

function selectContact(id) {
  state.selectedId = Number(id);
  renderList();
  renderDetail();
  if (window.matchMedia('(max-width: 980px)').matches) {
    el.detailPane.classList.add('is-open');
  }
}

/* ------------------------------------------------------------------ *
 * 收藏
 * ------------------------------------------------------------------ */

async function toggleStar(id) {
  const contact = findContact(id);
  if (!contact) return;
  const next = !contact.starred;
  try {
    await api.setStarred(id, next);
    toast(next ? '已加入收藏夹' : '已取消收藏');
    await load();
  } catch (error) {
    toast(error.message, 'err');
  }
}

/* ------------------------------------------------------------------ *
 * 新建 / 编辑
 * ------------------------------------------------------------------ */

function openForm(contact = null) {
  state.editingId = contact?.id ?? null;
  state.formMethods = contact
    ? contact.methods.map((method) => ({
        type: method.type,
        label: method.label,
        value: method.value,
        primary: method.primary,
      }))
    : [{ type: 'phone', label: '手机', value: '', primary: true }];

  el.formTitle.textContent = contact ? '编辑联系人' : '新建联系人';
  el.formSubtitle.textContent = contact
    ? '修改后点击保存，联系方式也会同步更新。'
    : '一个联系人可以添加多个手机号、邮箱或社交账号。';
  el.fieldName.value = contact?.name ?? '';
  el.fieldCompany.value = contact?.company ?? '';
  el.fieldTitle.value = contact?.title ?? '';
  el.fieldTags.value = contact?.tags.join('，') ?? '';
  el.fieldNotes.value = contact?.notes ?? '';
  el.fieldStarred.checked = Boolean(contact?.starred);

  clearFormErrors();
  renderMethodRows();
  openModal(el.formModal);
  setTimeout(() => el.fieldName.focus(), 60);
}

function collectMethods() {
  return [...el.methodEditor.querySelectorAll('.method-row')].map((row) => ({
    type: row.querySelector('.method-type').value,
    label: row.querySelector('.method-label').value.trim(),
    value: row.querySelector('.method-value-input').value.trim(),
    primary: row.querySelector('.primary-toggle').classList.contains('is-primary'),
  }));
}

function clearFormErrors() {
  el.fieldName.classList.remove('has-error');
  $$('[data-error-for]').forEach((node) => {
    node.textContent = '';
  });
}

function showErrors(error) {
  const details = Array.isArray(error.details) ? error.details : [];
  let handled = false;
  for (const detail of details) {
    const field = String(detail.field ?? '').split(/[.[]/)[0];
    const target = document.querySelector(`[data-error-for="${field}"]`);
    if (target) {
      target.textContent = detail.message ?? error.message;
      handled = true;
    }
    if (field === 'name') el.fieldName.classList.add('has-error');
  }
  if (!handled) toast(error.message, 'err');
}

async function saveContact(event) {
  event.preventDefault();
  clearFormErrors();

  const methods = collectMethods();
  const payload = {
    name: el.fieldName.value.trim(),
    company: el.fieldCompany.value.trim(),
    title: el.fieldTitle.value.trim(),
    tags: el.fieldTags.value.trim(),
    notes: el.fieldNotes.value.trim(),
    starred: el.fieldStarred.checked,
    methods: methods
      .filter((method) => method.value !== '')
      .map((method) => ({
        type: method.type,
        label: method.label,
        value: method.value,
        primary: method.primary,
      })),
  };

  if (!payload.name) {
    el.fieldName.classList.add('has-error');
    document.querySelector('[data-error-for="name"]').textContent = '请填写姓名';
    el.fieldName.focus();
    return;
  }

  el.saveBtn.disabled = true;
  el.saveBtn.textContent = '保存中…';
  try {
    const result = state.editingId
      ? await api.updateContact(state.editingId, payload)
      : await api.createContact(payload);
    closeModal(el.formModal);
    toast(state.editingId ? '联系人已更新' : '联系人已创建');
    state.selectedId = result.contact.id;
    await load();
  } catch (error) {
    showErrors(error);
  } finally {
    el.saveBtn.disabled = false;
    el.saveBtn.textContent = '保存';
  }
}

/* ------------------------------------------------------------------ *
 * 删除
 * ------------------------------------------------------------------ */

function openConfirm(contact) {
  state.deletingId = contact.id;
  el.confirmText.textContent = `确定删除「${contact.name}」吗？该联系人的 ${contact.methods.length} 条联系方式会一并删除，且不可恢复。`;
  openModal(el.confirmModal);
}

async function confirmDelete() {
  if (!state.deletingId) return;
  el.confirmDeleteBtn.disabled = true;
  try {
    await api.deleteContact(state.deletingId);
    closeModal(el.confirmModal);
    state.deletingId = null;
    toast('联系人已删除');
    await load({ preserveSelection: false });
  } catch (error) {
    toast(error.message, 'err');
  } finally {
    el.confirmDeleteBtn.disabled = false;
  }
}

/* ------------------------------------------------------------------ *
 * 导入 / 导出
 * ------------------------------------------------------------------ */

function openImportModal() {
  el.importResult.classList.add('is-hidden');
  el.importResult.innerHTML = '';
  el.importProgress.classList.add('is-hidden');
  el.fileInput.value = '';
  openModal(el.importModal);
}

async function importFile(file) {
  if (!/\.xlsx$/i.test(file.name)) {
    toast('只支持 .xlsx 文件，可先下载模板', 'err');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    toast('文件超过 8MB，请拆分后再导入', 'err');
    return;
  }

  el.importProgress.classList.remove('is-hidden');
  el.importResult.classList.add('is-hidden');

  try {
    const result = await api.importFile(file);
    renderImportResult(result);
    if (result.added > 0) {
      state.view = 'all';
      state.query = '';
      state.tag = '';
      el.searchInput.value = '';
    }
    await load();
    toast(`导入完成：新增 ${result.added} 位联系人`, result.failed > 0 ? 'err' : 'ok');
  } catch (error) {
    toast(error.message, 'err');
    el.importResult.classList.remove('is-hidden');
    el.importResult.innerHTML = `<p class="form-hint">${escapeHtml(error.message)}</p>`;
  } finally {
    el.importProgress.classList.add('is-hidden');
  }
}

function renderImportResult(result) {
  const errors = result.errors ?? [];
  el.importResult.classList.remove('is-hidden');
  el.importResult.innerHTML = `
    <div class="result-summary">
      <div class="result-stat" data-tone="ok"><strong>${result.added}</strong><span>新增</span></div>
      <div class="result-stat" data-tone="warn"><strong>${result.skipped}</strong><span>跳过重复</span></div>
      <div class="result-stat" data-tone="err"><strong>${result.failed}</strong><span>失败</span></div>
    </div>
    ${
      errors.length
        ? `<div class="result-list">${errors
            .map(
              (item) => `<div class="result-row">
                <span class="row-no">第 ${item.row} 行</span>
                <span class="row-name">${escapeHtml(item.name)}</span>
                <span class="row-reason">${escapeHtml(item.reason)}</span>
              </div>`,
            )
            .join('')}</div>
        <p class="form-hint" style="margin-top:8px">共 ${result.total} 行数据，其中 ${result.added} 行已成功写入。</p>`
        : `<p class="form-hint">全部 ${result.total} 行数据导入成功。</p>`
    }`;
}

function exportExcel() {
  const link = document.createElement('a');
  link.href = api.exportUrl();
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  toast('正在导出 Excel，请稍候…');
}

/* ------------------------------------------------------------------ *
 * 弹窗与快捷键
 * ------------------------------------------------------------------ */

function openModal(node) {
  node.classList.remove('is-hidden');
  document.body.classList.add('modal-open');
}

function closeModal(node) {
  node.classList.add('is-hidden');
  if ($('.modal-root:not(.is-hidden)') === null) document.body.classList.remove('modal-open');
}

function closeTopModal() {
  const openModalNode = $$('.modal-root').find((node) => !node.classList.contains('is-hidden'));
  if (openModalNode) {
    closeModal(openModalNode);
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * 事件绑定
 * ------------------------------------------------------------------ */

function bindEvents() {
  el.themeToggle.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  el.newBtn.addEventListener('click', () => openForm());
  el.importBtn.addEventListener('click', () => openImportModal());
  el.exportBtn.addEventListener('click', exportExcel);

  $$('.nav-item').forEach((node) => {
    node.addEventListener('click', () => {
      state.view = node.dataset.view;
      state.tag = '';
      state.query = '';
      el.searchInput.value = '';
      load();
    });
  });

  el.sortSelect.addEventListener('change', () => {
    state.sort = el.sortSelect.value;
    load();
  });

  let searchTimer = null;
  el.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = el.searchInput.value.trim();
      load();
    }, 220);
  });
  el.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      clearTimeout(searchTimer);
      state.query = el.searchInput.value.trim();
      load();
    }
  });

  el.contactList.addEventListener('click', (event) => {
    const star = event.target.closest('[data-star]');
    if (star) {
      event.stopPropagation();
      toggleStar(Number(star.dataset.star));
      return;
    }
    const card = event.target.closest('.contact-card');
    if (card) selectContact(Number(card.dataset.id));
  });

  el.contactList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.contact-card');
    if (!card) return;
    event.preventDefault();
    selectContact(Number(card.dataset.id));
  });

  el.tagList.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-tag]');
    if (!chip) return;
    const tag = chip.dataset.tag;
    if (state.view === 'tag' && state.tag === tag) {
      state.view = 'all';
      state.tag = '';
    } else {
      state.view = 'tag';
      state.tag = tag;
    }
    load();
  });

  el.detailPane.addEventListener('click', async (event) => {
    const actionNode = event.target.closest('[data-action]');
    if (!actionNode) return;
    const contact = findContact(state.selectedId);
    const action = actionNode.dataset.action;

    if (action === 'close-detail') {
      el.detailPane.classList.remove('is-open');
      return;
    }
    if (action === 'copy') {
      const ok = await copyText(actionNode.dataset.copy ?? '');
      toast(ok ? '已复制到剪贴板' : '复制失败，请手动选择', ok ? 'ok' : 'err');
      return;
    }
    if (!contact) return;
    if (action === 'edit') openForm(contact);
    if (action === 'delete') openConfirm(contact);
    if (action === 'star') toggleStar(contact.id);
  });

  el.emptyState.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'clear-filter') {
      state.view = 'all';
      state.tag = '';
      state.query = '';
      el.searchInput.value = '';
      load();
      return;
    }
    openForm();
  });

  el.addMethodBtn.addEventListener('click', () => {
    state.formMethods = collectMethods();
    const lastType = state.formMethods.at(-1)?.type ?? 'phone';
    state.formMethods.push({ type: lastType, label: '', value: '', primary: state.formMethods.length === 0 });
    renderMethodRows();
    const inputs = $$('.method-value-input', el.methodEditor);
    inputs.at(-1)?.focus();
  });

  el.methodEditor.addEventListener('click', (event) => {
    const primaryBtn = event.target.closest('.primary-toggle');
    if (primaryBtn) {
      const row = primaryBtn.closest('.method-row');
      const index = Number(row.dataset.index);
      const methods = collectMethods();
      methods.forEach((method, i) => {
        method.primary = i === index;
      });
      state.formMethods = methods;
      renderMethodRows();
      return;
    }

    const removeBtn = event.target.closest('.remove-method');
    if (removeBtn) {
      const row = removeBtn.closest('.method-row');
      const index = Number(row.dataset.index);
      const methods = collectMethods();
      methods.splice(index, 1);
      if (methods.length > 0 && !methods.some((method) => method.primary)) methods[0].primary = true;
      state.formMethods = methods;
      renderMethodRows();
    }
  });

  el.methodEditor.addEventListener('change', (event) => {
    const select = event.target.closest('.method-type');
    if (!select) return;
    const row = select.closest('.method-row');
    const valueInput = row.querySelector('.method-value-input');
    valueInput.placeholder = TYPE_PLACEHOLDER[select.value] ?? '内容';
    const labelInput = row.querySelector('.method-label');
    if (!labelInput.value.trim()) labelInput.placeholder = TYPE_LABEL[select.value] ?? '备注';
  });

  el.contactForm.addEventListener('submit', saveContact);

  el.fileInput.addEventListener('change', () => {
    const file = el.fileInput.files?.[0];
    if (file) importFile(file);
  });

  el.dropzone.addEventListener('click', () => el.fileInput.click());
  el.dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      el.fileInput.click();
    }
  });

  ['dragenter', 'dragover'].forEach((type) => {
    el.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      el.dropzone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach((type) => {
    el.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      el.dropzone.classList.remove('is-dragover');
    });
  });
  el.dropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) importFile(file);
  });

  el.confirmDeleteBtn.addEventListener('click', confirmDelete);

  $$('[data-close]').forEach((node) => {
    node.addEventListener('click', () => {
      const modal = node.closest('.modal-root');
      if (modal) closeModal(modal);
    });
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      el.searchInput.focus();
      el.searchInput.select();
    }
    if (event.key === 'Escape') {
      if (!closeTopModal()) {
        el.detailPane.classList.remove('is-open');
        if (state.query) {
          state.query = '';
          el.searchInput.value = '';
          load();
        }
      }
    }
  });
}

/* ------------------------------------------------------------------ *
 * 启动 & 深链接（便于分享与截图）
 * ------------------------------------------------------------------ */

async function init() {
  initTheme();
  bindEvents();

  const params = new URLSearchParams(window.location.search);
  if (params.get('view') === 'starred') state.view = 'starred';
  if (params.get('tag')) {
    state.view = 'tag';
    state.tag = params.get('tag');
  }
  if (params.get('q')) {
    state.query = params.get('q');
    el.searchInput.value = state.query;
  }
  if (params.get('sort')) {
    state.sort = params.get('sort');
    el.sortSelect.value = state.sort;
  }

  try {
    await load({ preserveSelection: false });
  } catch (error) {
    toast(`加载失败：${error.message}`, 'err');
    return;
  }

  if (params.get('contact')) {
    const contact = findContact(Number(params.get('contact')));
    if (contact) selectContact(contact.id);
  }

  const open = params.get('open');
  if (open === 'new') openForm();
  if (open === 'edit') {
    const contact = findContact(Number(params.get('id'))) ?? state.items[0];
    if (contact) openForm(contact);
  }
  if (open === 'import') openImportModal();
  if (params.get('theme') === 'dark') applyTheme('dark');
}

init();
