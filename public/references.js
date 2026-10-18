/* 参考图仅在本地处理；不上传、不调用 AI。 */
const referenceStorageKey = 'graphic-reference-images-v1';
let referenceBusy = false;
let referencesSaved = true;
let referenceQueue = Promise.resolve();
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片无法解码，请换一张 PNG、JPG 或 WebP 图片'));
    img.src = src;
  });
}
async function prepareReference(file, normalize = true) {
  const types = ['image/png', 'image/jpeg', 'image/webp'];
  const ext = /\.(png|jpe?g|webp)$/i.test(file.name || '');
  if (!types.includes(file.type) && !(file.type === '' && ext)) throw new Error('仅支持 PNG、JPG、WebP 图片');
  if (file.size > 8 * 1024 * 1024) throw new Error('请选择小于 8 MB 的图片');
  const source = await readFile(file);
  const image = await loadImage(source);
  if (!normalize) return source;
  const ratio = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .82);
}
function saveReferences() {
  try { localStorage.setItem(referenceStorageKey, JSON.stringify(refs)); referencesSaved = true; }
  catch { referencesSaved = false; toast('参考图已添加，但本地存储已满或不可用，刷新后可能丢失'); }
}
function renderReferences() {
  $('#refs').replaceChildren(...refs.map((src, i) => {
    const item = document.createElement('div');
    item.className = 'reference-item';
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'reference-preview';
    preview.setAttribute('aria-label', `预览参考图 ${i + 1}`);
    const img = new Image();
    img.src = src;
    img.alt = `参考图 ${i + 1}`;
    preview.append(img);
    preview.onclick = () => {
      const content = $('#dialog-content');
      const large = new Image();
      large.src = src;
      large.alt = img.alt;
      large.className = 'reference-large';
      const text = document.createElement('p');
      text.textContent = '参考图仅保存在当前浏览器。本地模板可参考第一张图的主色，不会进行 AI 重绘。';
      content.replaceChildren(large, text);
      $('#dialog').classList.remove('preview-dialog');
      $('#dialog').showModal();
    };
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'reference-remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `删除参考图 ${i + 1}`);
    remove.onclick = () => { refs.splice(i, 1); saveReferences(); renderReferences(); };
    item.append(preview, remove);
    return item;
  }));
  $('#ref-count').textContent = `${refs.length} / 5 张`;
  $('#ref-upload').disabled = refs.length >= 5 || referenceBusy;
  $('#ref-status').textContent = referenceBusy ? '正在读取图片…' : refs.length ? `已添加 ${refs.length} 张 · ${referencesSaved ? '已在当前浏览器保留' : '存储不可用，刷新后可能丢失'}` : '还没有参考图';
  $('#reference-options').classList.toggle('hidden', !refs.length);
}
async function addRefs(files) {
  const incoming = Array.from(files || []).filter(Boolean);
  referenceQueue = referenceQueue.then(async () => {
    referenceBusy = true;
    renderReferences();
    let added = 0;
    let limited = false;
    const errors = new Set();
    try {
      for (const file of incoming) {
        if (refs.length >= 5) { limited = true; break; }
        try { refs.push(await prepareReference(file)); added++; }
        catch (error) { errors.add(error.message || '读取图片失败，请重试'); }
      }
      if (added) saveReferences();
    } finally {
      referenceBusy = false;
      renderReferences();
      $('#ref-files').value = '';
    }
    const messages = [];
    if (added) messages.push(`已添加 ${added} 张参考图${referencesSaved ? '' : '（存储不可用，刷新后可能丢失）'}`);
    if (limited) messages.push('最多保留 5 张，可删除后重新添加');
    messages.push(...errors);
    if (messages.length) toast(messages.join('；'));
  });
  return referenceQueue;
}
async function referenceColor() {
  if (!refs.length || !$('#use-reference-color').checked) return '';
  const image = await loadImage(refs[0]);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, 48, 48);
  const data = ctx.getImageData(0, 0, 48, 48).data;
  const bins = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const rgb = [data[i], data[i + 1], data[i + 2]];
    const max = Math.max(...rgb), min = Math.min(...rgb);
    if (data[i + 3] < 128 || min > 235 || max < 25) continue;
    const key = rgb.map(v => Math.floor(v / 32)).join(',');
    if (!bins.has(key)) bins.set(key, { sum: [0, 0, 0], weight: 0, count: 0 });
    const bin = bins.get(key);
    bin.count++;
    bin.weight += 1 + (max - min) / 128;
    rgb.forEach((v, j) => { bin.sum[j] += v; });
  }
  const dominant = [...bins.values()].sort((a, b) => b.weight - a.weight)[0];
  return dominant ? '#' + dominant.sum.map(v => Math.round(v / dominant.count).toString(16).padStart(2, '0')).join('') : '#18181b';
}
$('#ref-upload').onclick = () => $('#ref-files').click();
$('#ref-files').onchange = e => addRefs(e.target.files);
const dropZone = $('#reference-dropzone');
['dragenter', 'dragover'].forEach(name => dropZone.addEventListener(name, e => { e.preventDefault(); dropZone.classList.add('drag-over'); }));
['dragleave', 'drop'].forEach(name => dropZone.addEventListener(name, e => { e.preventDefault(); dropZone.classList.remove('drag-over'); }));
dropZone.addEventListener('drop', e => addRefs(e.dataTransfer.files));
document.addEventListener('paste', e => {
  if ($('#dialog').open) return;
  const files = Array.from(e.clipboardData?.items || []).filter(x => x.kind === 'file').map(x => x.getAsFile()).filter(Boolean);
  if (files.length) { e.preventDefault(); tab('detail'); addRefs(files); }
});
try {
  const saved = JSON.parse(localStorage.getItem(referenceStorageKey) || '[]');
  if (Array.isArray(saved)) refs = saved.filter(src => typeof src === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(src) && src.length < 1000000).slice(0, 5);
} catch { /* 存储不可用时仍可使用本次上传。 */ }
renderReferences();
