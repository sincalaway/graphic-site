(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
  var MAX = 8 * 1024 * 1024;

  function mount(container, options) {
    options = options || {};
    if (!container || !(container instanceof Element)) throw new TypeError('需要有效的容器元素');
    var root = document.createElement('section');
    root.className = 'graphic-sketch';
    root.setAttribute('aria-label', '本地手稿画板');
    root.innerHTML = '<div class="sketch-head"><div><h2>手稿画板</h2><p>本地手稿 · 仅作为输入，不会生成 AI 图片</p></div><span class="sketch-status" aria-live="polite">准备就绪</span></div>' +
      '<div class="graphic-sketch-layout"><div class="sketch-stage"><div class="sketch-canvas-wrap"><canvas width="800" height="800" role="img" aria-label="手稿绘图区"></canvas><div class="sketch-drop" hidden>松开以上传手稿</div></div><p class="sketch-tip">在画布上绘制，或将 PNG、JPG、WebP 拖入画布（单张不超过 8MB）</p></div>' +
      '<div class="sketch-tools"><div class="sketch-tool-row" role="toolbar" aria-label="绘图工具"><button type="button" class="sketch-btn is-active" data-tool="pen" aria-pressed="true">画笔</button><button type="button" class="sketch-btn" data-tool="eraser" aria-pressed="false">橡皮擦</button><button type="button" class="sketch-btn" data-action="undo" aria-label="撤销" disabled>撤销</button><button type="button" class="sketch-btn" data-action="redo" aria-label="重做" disabled>重做</button></div>' +
      '<div class="sketch-control"><label for="sketch-color">颜色</label><div class="sketch-colors"><button type="button" class="sketch-swatch is-selected" data-color="#17171a" style="--swatch:#17171a" aria-label="黑色" aria-pressed="true"></button><button type="button" class="sketch-swatch" data-color="#5140e8" style="--swatch:#5140e8" aria-label="紫色" aria-pressed="false"></button><button type="button" class="sketch-swatch" data-color="#e0476e" style="--swatch:#e0476e" aria-label="红色" aria-pressed="false"></button><button type="button" class="sketch-swatch" data-color="#168c8a" style="--swatch:#168c8a" aria-label="青色" aria-pressed="false"></button><label class="sketch-custom-color" title="自定义颜色"><span aria-hidden="true">＋</span><input id="sketch-color" type="color" value="#17171a" aria-label="自定义颜色"></label></div></div>' +
      '<div class="sketch-control"><label for="sketch-size">笔粗 <output id="sketch-size-value">8px</output></label><input id="sketch-size" type="range" min="1" max="48" value="8" aria-label="笔刷粗细"></div>' +
      '<div class="sketch-actions"><button type="button" class="sketch-secondary" data-action="upload">上传手稿</button><button type="button" class="sketch-secondary sketch-clear" data-action="clear">清空画板</button><input class="sketch-file" type="file" accept="image/png,image/jpeg,image/webp" hidden></div>' +
      '<p class="sketch-note">支持 PNG / JPG / WebP。图片仅在当前浏览器本地读取。</p></div></div>' +
      '<div class="sketch-confirm" hidden role="dialog" aria-modal="true" aria-labelledby="sketch-confirm-title"><div class="sketch-confirm-card"><h3 id="sketch-confirm-title">清空画板？</h3><p>当前手稿会被清除，此操作可以用撤销恢复。</p><div><button type="button" class="sketch-secondary" data-confirm="no">取消</button><button type="button" class="sketch-danger" data-confirm="yes">确认清空</button></div></div></div>';
    container.appendChild(root);
    var canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
    var status = root.querySelector('.sketch-status'), fileInput = root.querySelector('.sketch-file'), drop = root.querySelector('.sketch-drop');
    var tool = 'pen', color = '#17171a', size = 8, drawing = false, last = null, destroyed = false;
    var undo = [], redo = [];
    function notify() { if (typeof options.onChange === 'function') options.onChange(api); }
    function setStatus(text) { status.textContent = text; }
    function snapshot() { return ctx.getImageData(0, 0, 800, 800); }
    function restore(image) { ctx.putImageData(image, 0, 0); }
    function resetWhite() { ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 800, 800); ctx.restore(); }
    function historyChanged() { root.querySelector('[data-action="undo"]').disabled = !undo.length; root.querySelector('[data-action="redo"]').disabled = !redo.length; }
    function record() { undo.push(snapshot()); if (undo.length > 30) undo.shift(); redo = []; historyChanged(); notify(); }
    function position(e) { var r = canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(800, (e.clientX - r.left) * 800 / r.width)), y: Math.max(0, Math.min(800, (e.clientY - r.top) * 800 / r.height)) }; }
    function stroke(a, b) { ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = size; ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore(); }
    function start(e) { if (destroyed || e.pointerType === 'mouse' && e.button !== 0) return; e.preventDefault(); canvas.setPointerCapture(e.pointerId); record(); drawing = true; last = position(e); stroke(last, { x: last.x + .01, y: last.y + .01 }); }
    function move(e) { if (!drawing) return; e.preventDefault(); var p = position(e); stroke(last, p); last = p; }
    function end(e) { if (!drawing) return; drawing = false; last = null; try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} notify(); }
    function selectTool(next) { tool = next; root.querySelectorAll('[data-tool]').forEach(function (b) { var yes = b.dataset.tool === next; b.classList.toggle('is-active', yes); b.setAttribute('aria-pressed', String(yes)); }); }
    function selectColor(next) { color = next; root.querySelector('#sketch-color').value = next; root.querySelectorAll('[data-color]').forEach(function (b) { var yes = b.dataset.color.toLowerCase() === next.toLowerCase(); b.classList.toggle('is-selected', yes); b.setAttribute('aria-pressed', String(yes)); }); }
    function undoStep() { if (!undo.length) return; redo.push(snapshot()); restore(undo.pop()); historyChanged(); notify(); }
    function redoStep() { if (!redo.length) return; undo.push(snapshot()); restore(redo.pop()); historyChanged(); notify(); }
    function clearNow() { record(); resetWhite(); setStatus('画板已清空'); notify(); }
    function validDataUrl(dataUrl) { return typeof dataUrl === 'string' && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+=*$/i.test(dataUrl); }
    function loadImage(dataUrl) { return new Promise(function (resolve, reject) { if (!validDataUrl(dataUrl)) return reject(new Error('只支持本地 PNG、JPG 或 WebP 图片')); var img = new Image(); img.onload = function () { try { record(); resetWhite(); var scale = Math.min(800 / img.naturalWidth, 800 / img.naturalHeight, 1); var w = img.naturalWidth * scale, h = img.naturalHeight * scale; ctx.drawImage(img, (800 - w) / 2, (800 - h) / 2, w, h); setStatus('已载入本地手稿'); notify(); resolve(); } catch (e) { reject(new Error('图片载入失败')); } }; img.onerror = function () { reject(new Error('图片载入失败')); }; img.src = dataUrl; }); }
    function readFile(file) { if (!file || !TYPES.has(file.type)) return Promise.reject(new Error('请选择 PNG、JPG 或 WebP 图片')); if (file.size > MAX) return Promise.reject(new Error('图片不能超过 8MB')); return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = function () { reject(new Error('图片读取失败')); }; reader.readAsDataURL(file); }); }
    canvas.addEventListener('pointerdown', start); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('pointerleave', function (e) { if (drawing && e.pointerType === 'mouse') end(e); });
    root.querySelectorAll('[data-tool]').forEach(function (b) { b.addEventListener('click', function () { selectTool(b.dataset.tool); }); });
    root.querySelectorAll('[data-color]').forEach(function (b) { b.addEventListener('click', function () { selectColor(b.dataset.color); }); });
    root.querySelector('#sketch-color').addEventListener('input', function (e) { selectColor(e.target.value); });
    root.querySelector('#sketch-size').addEventListener('input', function (e) { size = Number(e.target.value); root.querySelector('#sketch-size-value').textContent = size + 'px'; });
    root.querySelector('[data-action="undo"]').addEventListener('click', undoStep); root.querySelector('[data-action="redo"]').addEventListener('click', redoStep);
    root.querySelector('[data-action="upload"]').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function (e) { var f = e.target.files[0]; if (f) readFile(f).then(loadImage).catch(function (err) { setStatus(err.message); }); e.target.value = ''; });
    root.querySelector('[data-action="clear"]').addEventListener('click', function () { root.querySelector('.sketch-confirm').hidden = false; root.querySelector('[data-confirm="no"]').focus(); });
    root.querySelector('[data-confirm="no"]').addEventListener('click', function () { root.querySelector('.sketch-confirm').hidden = true; }); root.querySelector('[data-confirm="yes"]').addEventListener('click', function () { root.querySelector('.sketch-confirm').hidden = true; clearNow(); });
    ['dragenter', 'dragover'].forEach(function (name) { canvas.addEventListener(name, function (e) { e.preventDefault(); drop.hidden = false; }); }); canvas.addEventListener('dragleave', function () { drop.hidden = true; }); canvas.addEventListener('drop', function (e) { e.preventDefault(); drop.hidden = true; var f = e.dataTransfer.files[0]; readFile(f).then(loadImage).catch(function (err) { setStatus(err.message); }); });
    root.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redoStep() : undoStep(); } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redoStep(); } });
    resetWhite();
    var api = { getImage: function () { return canvas.toDataURL('image/png'); }, hasDrawing: function () { var d = ctx.getImageData(0, 0, 800, 800).data; for (var i = 0; i < d.length; i += 4) if (d[i] !== 255 || d[i + 1] !== 255 || d[i + 2] !== 255 || d[i + 3] !== 255) return true; return false; }, loadImage: loadImage, clear: function () { clearNow(); }, destroy: function () { destroyed = true; root.remove(); } };
    return api;
  }
  global.GraphicSketch = { mount: mount };
})(window);
