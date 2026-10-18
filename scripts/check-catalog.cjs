#!/usr/bin/env node
// 本地检查：node scripts/check-catalog.cjs（不联网、不修改配置）。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../public');
const context = { window: {} };
let total = 0;
let placeholders = 0;
const ids = new Set();
function id(item) {
  assert(item && typeof item === 'object', '配置项必须是对象');
  assert(typeof item.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id), `无效 ID：${item.id}`);
  assert(!ids.has(item.id), `重复 ID：${item.id}`);
  ids.add(item.id);
  assert(typeof item.name === 'string' && item.name.trim(), `${item.id} 缺少名称`);
}
try {
  vm.runInNewContext(fs.readFileSync(path.join(root, 'catalog.js'), 'utf8'), context, { timeout: 1000 });
  const categories = context.window.GRAPHIC_CATALOG?.categories;
  assert(Array.isArray(categories), 'GRAPHIC_CATALOG.categories 必须是数组');
  categories.forEach(c => id(c));
  for (const c of categories) {
    assert(Array.isArray(c.icons), `${c.id}.icons 必须是数组`);
    assert(c.description === undefined || typeof c.description === 'string', `${c.id}.description 必须是文本`);
    assert(c.reservedSlots === undefined || (Number.isSafeInteger(c.reservedSlots) && c.reservedSlots >= 0), `${c.id}.reservedSlots 必须是非负整数`);
    placeholders += c.reservedSlots || 0;
    for (const i of c.icons) {
      id(i);
      assert(i.tags === undefined || (Array.isArray(i.tags) && i.tags.every(t => typeof t === 'string')), `${i.id}.tags 必须是文本数组`);
      if (i.placeholder) {
        assert(i.src === undefined, `${i.id} 是占位，不应填写 src`);
        placeholders++;
        continue;
      }
      assert(typeof i.src === 'string' && /\.(svg|png|jpe?g|webp|gif|avif)$/i.test(i.src), `${i.id} 图片格式或路径错误`);
      assert(!/^[a-z]+:/i.test(i.src) && !i.src.startsWith('/') && !/[\\?#]/.test(i.src) && !i.src.split('/').includes('..'), `${i.id} 请使用本站相对图片路径`);
      const file = path.join(root, i.src);
      assert(fs.existsSync(file) && fs.statSync(file).isFile(), `${i.id} 图片不存在或大小写错误：${i.src}`);
      total++;
    }
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const src = match[1];
    if (src.startsWith('data:') || /^(https?:|#)/.test(src)) continue;
    assert(fs.existsSync(path.join(root, src)), `页面引用的文件不存在：${src}`);
  }
  for (const file of ['app.js', 'catalog.js', 'catalog-ui.js']) new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file });
  console.log(`检查通过：${categories.length} 个分类，${total} 张真实图标，${placeholders} 个占位；脚本语法与页面资源引用正常。`);
} catch (error) {
  console.error(`检查失败：${error.message}`);
  process.exitCode = 1;
}
