(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const root = $('#catalog');
  const all = window.GRAPHIC_CATALOG?.categories;
  const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  // 只接受本站相对图片地址；不把配置文字当作 HTML 执行。
  const imagePath = src => {
    if (typeof src !== 'string' || !src || /[\\?#]/.test(src)) return null;
    if (src.startsWith('/') || src.split('/').some(p => p === '..') || /^[a-z]+:/i.test(src)) return null;
    return /\.(svg|png|jpe?g|webp|gif|avif)$/i.test(src) ? src : null;
  };
  const ids = new Set();
  let skipped = 0;
  const validId = item => {
    if (!item || typeof item.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  };
  const categories = (Array.isArray(all) ? all : []).filter(c => {
    if (!validId(c) || typeof c.name !== 'string' || !Array.isArray(c.icons)) { skipped++; return false; }
    return true;
  }).map(c => ({
    ...c,
    icons: c.icons.filter(i => {
      if (!validId(i) || typeof i.name !== 'string' || (!i.placeholder && !imagePath(i.src))) { skipped++; return false; }
      return true;
    }),
    reservedSlots: Number.isSafeInteger(c.reservedSlots) && c.reservedSlots > 0 ? c.reservedSlots : 0
  }));
  let active = 'all';
  let query = '';
  const count = c => c.icons.filter(i => !i.placeholder).length;
  const total = categories.reduce((sum, c) => sum + count(c), 0);
  function setView(view) {
    const library = view === 'library';
    $('#catalog').classList.toggle('hidden', !library);
    $('#studio-view').classList.toggle('hidden', library);
    ['library', 'studio'].forEach(name => {
      const b = $('#view-' + name);
      b.classList.toggle('active', name === view);
      b.setAttribute('aria-pressed', String(name === view));
    });
  }
  $('#view-library').onclick = () => setView('library');
  $('#view-studio').onclick = () => setView('studio');
  document.querySelectorAll('[data-mode], #generate, #works').forEach(b => b.addEventListener('click', () => setView('studio')));
  $('#catalog-total').textContent = `${categories.length} 个分类 · ${total} 张图标`;
  if (skipped || !Array.isArray(all)) {
    $('#catalog-warning').textContent = '部分配置未能加载，请检查 catalog.js 中的格式、唯一 ID 和图片路径。';
    $('#catalog-warning').classList.remove('hidden');
  }
  function filters() {
    const options = [{ id: 'all', name: '全部分类', size: total }, ...categories.map(c => ({ ...c, size: count(c) }))];
    $('#catalog-filters').replaceChildren(...options.map(c => {
      const b = node('button', 'category-chip' + (active === c.id ? ' active' : ''));
      b.type = 'button';
      b.dataset.category = c.id;
      b.setAttribute('aria-pressed', String(active === c.id));
      b.append(node('span', '', c.name), node('small', '', String(c.size)));
      b.onclick = () => { active = c.id; filters(); render(); };
      return b;
    }));
  }
  function placeholder(name = '待添加图标') {
    const card = node('div', 'catalog-placeholder');
    card.append(node('span', 'placeholder-plus', '+'), node('span', '', name), node('small', '', '位置已预留'));
    return card;
  }
  function preview(item, category) {
    const content = $('#dialog-content');
    const img = node('img', 'catalog-preview');
    img.src = imagePath(item.src);
    img.alt = item.alt || item.name;
    const link = node('a', 'login-btn catalog-original', '打开原图');
    link.href = imagePath(item.src);
    link.target = '_blank';
    link.rel = 'noopener';
    content.replaceChildren(node('h2', '', item.name), img, node('p', '', `${category.name} · 图标素材预览，不会改变生成器模板`), link);
    $('#dialog').classList.remove('preview-dialog');
    $('#dialog').showModal();
  }
  function card(item, category) {
    if (item.placeholder) return placeholder(item.name);
    const button = node('button', 'catalog-card');
    button.type = 'button';
    button.dataset.icon = item.id;
    button.setAttribute('aria-label', `预览 ${item.name}`);
    const art = node('div', 'catalog-art');
    const img = node('img');
    img.src = imagePath(item.src);
    img.alt = item.alt || item.name;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = () => {
      art.replaceChildren(node('span', 'catalog-image-error', '图片未找到\n请检查文件路径'));
    };
    art.append(img);
    if (item.featured) art.append(node('span', 'catalog-badge', '精选'));
    const info = node('div', 'catalog-card-info');
    info.append(node('strong', '', item.name));
    const tags = Array.isArray(item.tags) ? item.tags.filter(t => typeof t === 'string') : [];
    info.append(node('small', '', tags.join(' / ') || category.name));
    button.append(art, info);
    button.onclick = () => preview(item, category);
    return button;
  }
  function render() {
    const content = $('#catalog-groups');
    content.replaceChildren();
    let found = 0;
    let groups = 0;
    categories.filter(c => active === 'all' || c.id === active).forEach(c => {
      const matches = c.icons.filter(i => {
        if (!query) return true;
        if (i.placeholder) return false;
        return [c.name, i.name, ...(Array.isArray(i.tags) ? i.tags : [])].join(' ').toLocaleLowerCase().includes(query);
      });
      if (query && !matches.length) return;
      const section = node('section', 'catalog-group');
      section.dataset.group = c.id;
      const heading = node('div', 'catalog-group-heading');
      const title = node('h2', '', c.name);
      title.append(node('small', '', String(count(c))));
      heading.append(title, node('span', '', !count(c) ? '已预留 · 随时添加' : '持续生长的灵感集合'));
      section.append(heading, node('p', 'catalog-group-description', c.description || ''));
      const grid = node('div', 'catalog-grid');
      grid.append(...matches.map(i => card(i, c)));
      if (!query) for (let j = 0; j < c.reservedSlots; j++) grid.append(placeholder());
      if (!grid.children.length) grid.append(node('p', 'catalog-empty', '这个分类还没有图标，添加配置后会自动出现在这里。'));
      section.append(grid);
      content.append(section);
      found += matches.filter(i => !i.placeholder).length;
      groups++;
    });
    if (!groups) content.append(node('p', 'catalog-empty', categories.length ? '没有找到匹配的图标，换个关键词试试。' : '还没有分类，请在 catalog.js 中添加第一个分类。'));
    $('#catalog-search-status').textContent = query ? `找到 ${found} 张图标` : `显示 ${found} 张图标，预留位置不计入数量`;
  }
  $('#catalog-search').addEventListener('input', e => { query = e.target.value.trim().toLocaleLowerCase(); render(); });
  $('#catalog-help').onclick = () => {
    $('#dialog-content').replaceChildren(
      node('h2', '', '给下一张图标，留一个位置'),
      node('p', '', '1. 将图片上传到仓库的 public/assets/icons/ 目录。'),
      node('p', '', '2. 编辑 public/catalog.js：复制一个分类或 icons 中的一项，填入名称和图片路径。'),
      node('p', '', '3. 提交修改，再发布 public 文件夹。分类与图标会自动排版，无需修改 HTML。'),
      node('p', '', 'reservedSlots 控制待添加空位，可设为 0；真实图标数量不受空位限制。当前页面不是上传后台，也不会把浏览器里的文件同步到仓库。'),
      node('p', '', '仓库根目录《添加分类与图标.md》有可以直接复制的完整示例。')
    );
    $('#dialog').classList.remove('preview-dialog');
    $('#dialog').showModal();
  };
  filters();
  render();
  setView('library');
})();
