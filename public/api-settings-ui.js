/* Personal API settings: values are never embedded in source or work records. */
(() => {
  "use strict";
  const q = (s) => document.querySelector(s);
  const esc = (s) => escapeXML(String(s ?? ""));
  function refresh() {
    const s = GraphicAPI.status(),
      remote = !s.demo;
    q(".demo-pill").textContent = remote ? "API" : "DEMO";
    q("#api-state").textContent = remote
      ? s.protocol === "comfyui-api" ? "ComfyUI 本机 workflow · 仅在点击生成时运行" : `${(s.provider && window.GraphicImageProviders && GraphicImageProviders.get(s.provider) ? GraphicImageProviders.get(s.provider).label : s.protocol) || "同源 API"} · ${s.model || "已配置"} · 服务商可能计费`
      : "未配置 API · 当前仅本地模板演示，不扣费";
    q("#api-help").textContent = remote ? "管理 API ↗" : "配置 API ↗";
    q(".canvas-status").textContent = remote
      ? s.protocol === "comfyui-api" ? "ComfyUI 本机接口 · 浏览器直连" : s.protocol === "multi-proxy" ? "使用你的 API · 经本站代理" : "使用你的 API · 浏览器直连 / 自有后端"
      : "API 未配置 · 本地演示";
    q(".generate-hint").textContent = remote
      ? s.protocol === "comfyui-api" ? "运行已导入的 workflow；当前页面提示词不会自动映射" : "真实 API · 提示词与参考图将发送到所选服务"
      : "本地模板 · 非 AI 生成 · 不扣费";
    q("#credits").textContent = remote ? s.protocol === "comfyui-api" ? "本机资源" : "服务商计费" : "演示 · 不扣费";
    q("#level-description").textContent = remote
      ? "档位仅作为设计要求传递，不自动切换已配置模型或承诺质量与价格。"
      : "档位仅记录参数，演示不调用模型。";
    const label = q("#generate-label");
    if (label)
      label.textContent = label.textContent.replace(
        / 张(?:演示)?$/,
        remote ? " 张" : " 张演示",
      );
    const tool = q("#tool-generate");
    if (tool) {
      const vector = location.hash === "#/vectorizer";
      const op = vector ? "vectorize" : "generate";
      tool.disabled = remote && !s.operations[op];
      tool.textContent = remote
        ? s.operations[op]
          ? vector
            ? "调用转换接口"
            : "✦ 生成设计"
          : "当前协议未配置此操作"
        : vector
          ? "预览 SVG 容器"
          : "✦ 生成演示";
      const note = q(".tool-generate small");
      if (note)
        note.textContent = remote
          ? s.operations[op]
            ? "真实 API · 将上传输入图片与描述 · 服务商可能计费"
            : "此协议不支持或未配置该操作；可在「管理 API」切回 demo"
          : "本地演示 · 不扣费";
    }
    if (q(".demo-note"))
      q(".demo-note").textContent = remote
        ? "使用你自行配置的生成服务；不连接原站账号、积分或支付。"
        : "独立前端演示；本地模板不连接 AI、账号或支付服务。";
  }
  function open() {
    const c = GraphicAPISettings.get();
    dialog(`<p class="flow-kicker">YOUR API / YOUR CHOICE</p><h2>接入你的生成服务</h2><p class="hint">推荐「多服务商 · 本站代理」：选服务商、粘贴 key、自由选择模型即可，不需要服务商开放 CORS。保存不发请求；检查 key 只读取模型列表，点击生成才会请求图片。</p>
      <form id="api-settings-form" autocomplete="off">
      <label class="checkline"><input type="checkbox" id="api-enabled" ${c.enabled ? "checked" : ""}>启用真实 API（关闭则使用 demo）</label>
      <label class="form-label">协议 <span class="required">*</span><select id="api-protocol"><option value="multi-proxy">多服务商 · 本站代理（推荐）</option><option value="comfyui-api">ComfyUI · 本机 API workflow</option><option value="openai-images">OpenAI 兼容 Images（非 Chat / Responses）</option><option value="graphic-json">Graphic 自有 JSON 契约</option></select></label>
      <p class="notice" id="api-protocol-note"></p>
      <div id="api-multi" hidden><label class="form-label">服务商 <span class="required">*</span><select id="api-provider">${(window.GraphicImageProviders ? GraphicImageProviders.list() : []).map((p) => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join("")}</select></label><p class="hint" id="api-provider-hint"></p></div>
      <label class="form-label" id="api-base-label">服务地址 / API 前缀 <span class="required">*</span><input id="api-base-url" type="url" placeholder="https://your-service.example/v1" spellcheck="false" maxlength="2000"></label>
      <p class="hint" id="api-base-hint">填写服务商文档中的 API 前缀（需要 /v1 时请自行包含）。仅 HTTPS 或 localhost HTTP，不允许 URL 中包含密钥、账号、查询或片段。</p>
      <p class="notice" id="api-request-preview" aria-live="polite" style="overflow-wrap:anywhere;white-space:pre-line"></p>
      <label class="form-label" id="api-model-label">模型 ID <span class="required">*</span><input id="api-model" list="api-model-list" placeholder="填写或从列表选择图像模型 ID" spellcheck="false" maxlength="200"><datalist id="api-model-list"></datalist></label>
      <label class="form-label" id="api-key-label">API key <span id="api-key-required">*</span><span class="api-key-row"><input id="api-key" type="password" autocomplete="new-password" spellcheck="false" placeholder="只保存在本标签页会话，不写入仓库" maxlength="4096"><button type="button" class="secondary" id="api-toggle-key" aria-label="显示 API key" aria-pressed="false">显示</button></span></label>
      <div id="api-key-tools" hidden><div class="api-settings-actions"><button type="button" class="secondary" id="api-detect">🔍 自动识别服务商</button><button type="button" class="secondary" id="api-proxy-models">检查 key 并获取模型</button></div><p class="hint">粘贴时多余的空格、换行、引号或「Bearer 」前缀会自动去掉。识别和检查只读取模型列表，不生成图片、不扣费。</p><p id="api-key-result" role="status" aria-live="polite" style="overflow-wrap:anywhere"></p><label class="checkline" id="api-watermark-line"><input type="checkbox" id="api-watermark">保留服务商水印（不勾选则请求无水印图）</label><label class="checkline"><input type="checkbox" id="api-remember">在这台设备上记住配置（关闭标签页后仍可用；共享电脑请勿勾选）</label></div>
      <div id="api-models-diagnostic" hidden><button type="button" class="secondary" id="api-check-models">只读检查模型列表</button><p class="hint">仅在点击时使用当前表单中的 key，经本站固定 GET /api/sensenova/models 查询 SenseNova 模型 ID；不保存设置，不发送提示词、图片或生图请求。模型出现在列表中不代表拥有生图权限。</p><p id="api-models-result" role="status" aria-live="polite" style="overflow-wrap:anywhere"></p></div>
      <div id="api-comfyui" hidden><label class="form-label">ComfyUI API workflow JSON<input id="api-workflow-file" type="file" accept="application/json,.json"></label><p id="api-workflow-status" role="status" aria-live="polite">尚未导入 workflow</p><p class="hint">请从 ComfyUI 导出 API 格式 workflow JSON 后导入。保存/导入不会联网；之后点生成时将原样提交 workflow，不会猜测并改写节点或自动映射当前表单提示词。暂不支持续改或矢量化。</p></div>
      <div id="api-custom-paths"><label class="form-label">生成路径（必填）<input id="api-generate-path" placeholder="/generate"></label><label class="form-label">续改路径（可选，空白表示不支持）<input id="api-edit-path" placeholder="/edit"></label><label class="form-label">转换路径（可选，空白表示不支持）<input id="api-vectorize-path" placeholder="留空则禁用远端转换"></label><p class="hint">均相对于上面的服务前缀；后端必须实现仓库 API_INTEGRATION.md 中的自有 JSON 契约。返回栅格图片，不等同于真正 SVG 路径。</p></div>
      <div class="notice"><b>浏览器端安全边界</b><p id="api-transfer-note">SenseNova 同源模式下，API key 会通过 Authorization: Bearer 发给本站函数，再由函数固定透传至 token.sensenova.cn；本站函数不保存密钥、不记录请求内容，也不回显密钥。高级直连模式则发给填写的服务地址。提示词、品牌信息及使用的参考图 / 手稿 / 源图也会发送给该服务，可能产生费用。请核对域名与隐私政策。</p><p>配置仅存 sessionStorage（本标签页会话，刷新保留；浏览器恢复或复制标签页可能保留）。页面脚本、扩展或 XSS 可以读取 key，这不是服务器端保密。建议使用低额度临时 key，或自己的后端代理；不要在共享设备上保留。</p><p>同源代理不需要供应商为 API 请求开放浏览器 CORS；返回的外链图片仍需允许 CORS，代理不会代取任意图片 URL。高级直连服务也需允许 CORS。保存不测试连通性，不验证额度。生成失败不自动重试、不静默退回 demo。</p></div>
      <label class="checkline"><input type="checkbox" id="api-consent"><span id="api-consent-copy">我了解 key 与输入内容会发给所选服务，并确认该地址可信、可能计费。</span></label>
      <p id="api-settings-error" role="alert" class="api-settings-error"></p><div class="api-settings-actions"><button type="submit" class="login-btn">保存设置</button><button type="button" id="api-clear" class="secondary">清除配置并使用 demo</button></div></form>`);
    q("#api-protocol").value = !c.enabled && c.protocol === "graphic-json" && !c.baseUrl ? "multi-proxy" : c.protocol || "multi-proxy";
    if (window.GraphicImageProviders && GraphicImageProviders.get(c.provider)) q("#api-provider").value = c.provider;
    q("#api-watermark").checked = !!c.watermark;
    q("#api-remember").checked = !!c.remember;
    const fields = {
      baseUrl: "api-base-url",
      model: "api-model",
      apiKey: "api-key",
      generatePath: "api-generate-path",
      editPath: "api-edit-path",
      vectorizePath: "api-vectorize-path",
    };
    Object.entries(fields).forEach(([key, id]) => {
      q("#" + id).value =
        c[key] ??
        (key === "generatePath"
          ? "/generate"
          : key === "editPath"
            ? "/edit"
            : "");
    });
    let diagnosticRevision = 0;
    let workflowJson = c.workflowJson || "";
    function workflowStatus() {
      if (!workflowJson) { q("#api-workflow-status").textContent = "尚未导入 workflow"; return; }
      try { q("#api-workflow-status").textContent = "已导入 API workflow · " + Object.keys(JSON.parse(workflowJson)).length + " 个节点 · " + Math.ceil(new Blob([workflowJson]).size / 1024) + " KiB"; }
      catch (_) { q("#api-workflow-status").textContent = "已保存的 workflow 无法解析，请重新导入。"; }
    }
    function protocol() {
      const custom = q("#api-protocol").value === "graphic-json";
      const proxy = q("#api-protocol").value === "sensenova-proxy";
      const comfy = q("#api-protocol").value === "comfyui-api";
      const multi = q("#api-protocol").value === "multi-proxy";
      diagnosticRevision++;
      q("#api-multi").hidden = !multi;
      q("#api-key-tools").hidden = !multi;
      q("#api-base-label").hidden = multi;
      q("#api-base-hint").hidden = multi;
      q("#api-request-preview").hidden = multi;
      q("#api-models-diagnostic").hidden = !proxy;
      q("#api-models-result").textContent = "";
      q("#api-base-url").readOnly = proxy || multi;
      q("#api-model").readOnly = proxy;
      q("#api-model-label").hidden = comfy;
      q("#api-key-label").hidden = comfy;
      q("#api-comfyui").hidden = !comfy;
      q("#api-base-hint").textContent = comfy
        ? "仅允许本机地址，例如 http://127.0.0.1:8188；此处不会测试连接。浏览器可能限制 HTTPS 页面访问本地 HTTP。"
        : "填写服务商文档中的 API 前缀（需要 /v1 时请自行包含）。仅 HTTPS 或 localhost HTTP，不允许 URL 中包含密钥、账号、查询或片段。";
      q("#api-transfer-note").textContent = comfy
        ? "ComfyUI 模式在点击生成时只向本机地址发送已导入的 workflow JSON 并由本机执行；当前页面中的品牌、提示词、参考图与模型不会自动写入或发送。workflow 自身包含的提示词、节点与路径则会交由本机 ComfyUI 处理。"
        : multi
        ? "多服务商代理模式下，API key 通过 Authorization: Bearer 发给本站函数，再由函数只转发到所选服务商的固定官方地址（白名单，不可自定义）；本站函数不保存密钥、不记录请求内容，也不回显密钥。提示词、品牌信息及使用的参考图 / 手稿 / 源图也会发送给该服务商，可能产生费用。"
        : "SenseNova 同源模式下，API key 会通过 Authorization: Bearer 发给本站函数，再由函数固定透传至 token.sensenova.cn；本站函数不保存密钥、不记录请求内容，也不回显密钥。高级直连模式则发给填写的服务地址。提示词、品牌信息及使用的参考图 / 手稿 / 源图也会发送给该服务，可能产生费用。请核对域名与隐私政策。";
      if (comfy) {
        let localAddress = false;
        try { const current = new URL(q("#api-base-url").value); localAddress = ["localhost", "127.0.0.1", "[::1]"].includes(current.hostname) && current.pathname === "/"; } catch (_) {}
        if (!localAddress)
          q("#api-base-url").value = "http://127.0.0.1:8188";
        q("#api-model").value = "";
        q("#api-key").value = "";
        q("#api-consent-copy").textContent = "我了解点击生成会把已导入的 workflow 原样发送到本机 ComfyUI，并由本机执行；当前页面提示词不会自动映射。";
      } else {
        q("#api-consent-copy").textContent = "我了解 key 与输入内容会发给所选服务，并确认该地址可信、可能计费。";
      }
      if (proxy) {
        q("#api-base-url").value = location.origin + "/api/sensenova";
        q("#api-model").value = "sensenova-u1.5-lite";
      }
      if (multi) {
        q("#api-base-url").value = location.origin + "/api/image/" + q("#api-provider").value;
        providerChanged(false);
      }
      q("#api-custom-paths").hidden = !custom;
      workflowStatus();
      q("#api-key-required").textContent = custom
        ? "（可选：仅限无需 Bearer 的自有服务）"
        : "*";
      q("#api-protocol-note").textContent = multi
        ? "请求经本站 Cloudflare 函数转发到所选服务商的官方地址（固定白名单，不能改成其他网址）。key 只随本次请求透传，不保存、不记录。生成多张时，对每次只能出 1 张的服务商会自动拆成多次请求（分别计费）。"
        : comfy
        ? "本机 ComfyUI API：POST /prompt，轮询 /history/{prompt_id}，再从 /view 读取图片。导入的 API workflow 会原样提交；不推断模型、节点或 prompt 输入映射。当前不支持续改/矢量化。保存不会请求。"
        : proxy
        ? "固定转发至 https://token.sensenova.cn/v1 的 generations / edits；只读模型检查固定 GET /models。不支持自定义目标、模型或矢量化。每次 1–4 张，请求最多 20 MiB；PNG/JPEG/WebP 单图最多 8 MiB，最多 6 图。需要已部署同源函数；保存不会验证部署或编辑能力。"
        : custom
        ? "支持 POST JSON 生成 / 续改 / 栅格转换；仅适用于实现 Graphic items 契约的后端，不是任意供应商通用协议。"
        : "支持 /images/generations（JSON）与 /images/edits（multipart image[]）。参考图和手稿通过 edits 发送。服务需支持模型、n 和对应图片字段；不支持 Chat、Responses、异步任务或矢量化。";
      preview();
    }
    function preview() {
      const out = q("#api-request-preview");
      try {
        const base = q("#api-base-url").value.trim();
        const url = new URL(base);
        if (url.username || url.password || url.search || url.hash ||
            !/^https?:$/.test(url.protocol)) throw new Error("invalid");
        if (q("#api-protocol").value === "comfyui-api") {
          if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/") throw new Error("invalid");
          out.textContent = "最终请求路径（仅本地预览，未测试连接）：\nPOST " + url.origin + "/prompt\nGET " + url.origin + "/history/{prompt_id}\nGET " + url.origin + "/view?filename=…\nworkflow 原样提交；当前表单提示词不会自动写入。HTTPS 页面直连本地 HTTP 可能被浏览器限制。";
          return;
        }
        const prefix = url.origin + url.pathname.replace(/\/$/, "");
        const openai = ["openai-images", "sensenova-proxy"].includes(q("#api-protocol").value);
        const suffixes = openai ? ["/images/generations", "/images/edits"] :
          [q("#api-generate-path").value.trim(), q("#api-edit-path").value.trim(), q("#api-vectorize-path").value.trim()].filter(Boolean);
        if (suffixes.some(p => !/^\/[A-Za-z0-9._~/-]*$/.test(p))) throw new Error("invalid");
        out.textContent = "最终请求路径（仅本地预览，未测试连接）：\n" +
          suffixes.map(p => "POST " + prefix + p).join("\n") +
          (openai ? "\n无图走 generations；带参考图或源图走 edits。" : "") +
          (openai && /\/(?:images\/(?:generations|edits)|chat\/completions|responses)\/?$/.test(url.pathname) ?
            "\n注意：这里应填写 API 前缀，不是完整接口路径。请按服务商文档修正，避免路径重复或协议不匹配。" : "");
      } catch (_) {
        out.textContent = "填写不含账号、密钥、查询或片段的有效服务地址后，可预览最终 POST 路径。保存不会测试连接。";
      }
    }
    let fetchedModels = [];
    function providerChanged(resetModel) {
      const p = window.GraphicImageProviders && GraphicImageProviders.get(q("#api-provider").value);
      if (!p) return;
      q("#api-base-url").value = location.origin + "/api/image/" + p.id;
      q("#api-provider-hint").textContent = "Key：" + p.keyHint + "。" + (p.edit ? "支持文生图和参考图编辑。" : "仅支持文生图（参考图 / 手稿 / 续改不可用）。") +
        (p.maxN > 1 ? "每次最多 " + p.maxN + " 张。" : "每次 1 张，多张会自动拆分请求。") + " 申请 key：" + p.keyUrl;
      q("#api-watermark-line").hidden = !p.watermark;
      const options = [...new Set([...(fetchedModels.length ? fetchedModels : []), ...p.suggested])];
      q("#api-model-list").innerHTML = options.map((id) => `<option value="${esc(id)}"></option>`).join("");
      if (resetModel || !q("#api-model").value.trim()) q("#api-model").value = p.suggested[0];
      if (resetModel) q("#api-key-result").textContent = "";
    }
    function showModels(providerId, result) {
      const p = GraphicImageProviders.get(providerId);
      fetchedModels = result.imageModels && result.imageModels.length ? result.imageModels : result.models || [];
      providerChanged(false);
      const current = q("#api-model").value.trim();
      if (fetchedModels.length && current && !result.models.includes(current)) {
        const better = p.suggested.find((id) => result.models.includes(id)) || fetchedModels[0];
        if (better) q("#api-model").value = better;
      }
      return fetchedModels.length;
    }
    q("#api-provider").onchange = () => { fetchedModels = []; diagnosticRevision++; providerChanged(true); };
    q("#api-proxy-models").onclick = async () => {
      const button = q("#api-proxy-models"), result = q("#api-key-result"), id = q("#api-provider").value;
      const revision = ++diagnosticRevision; button.disabled = true;
      result.textContent = "正在检查 key（只读模型列表，不生成图片）…";
      try {
        const checked = await GraphicAPI.proxyModels(id, q("#api-key").value);
        if (revision !== diagnosticRevision || !result.isConnected) return;
        if (!checked.supported) { result.textContent = "该服务商不提供模型列表接口，无法在线检查；请按文档填写模型 ID，保存后直接生成测试。"; return; }
        const count = showModels(id, checked);
        result.textContent = "✅ key 可用，共 " + checked.models.length + " 个模型" + (count ? "，其中 " + count + " 个看起来是图像模型，已放进「模型 ID」下拉列表。" : "。") + " 当前模型：" + q("#api-model").value;
      } catch (error) {
        if (revision !== diagnosticRevision || !result.isConnected) return;
        const safe = GraphicAPI.errorInfo(error);
        result.textContent = "❌ " + safe.title + "：" + safe.message + " " + safe.hint;
      } finally { button.disabled = false; }
    };
    q("#api-detect").onclick = async () => {
      const button = q("#api-detect"), result = q("#api-key-result");
      const revision = ++diagnosticRevision; button.disabled = true;
      result.textContent = "正在逐个服务商只读检查这个 key…";
      try {
        const found = await GraphicAPI.detectProvider(q("#api-key").value);
        if (revision !== diagnosticRevision || !result.isConnected) return;
        if (!found.provider) { result.textContent = "❌ 没有服务商接受这个 key。请确认 key 复制完整、未过期，并且是图像服务商的 key。"; return; }
        q("#api-provider").value = found.provider; fetchedModels = []; providerChanged(true);
        const label = GraphicImageProviders.get(found.provider).label;
        if (found.unverified) { result.textContent = "按 key 格式判断为「" + label + "」（该服务商无法在线验证，保存后生成一次即可确认）。"; return; }
        const count = showModels(found.provider, found);
        result.textContent = "✅ 识别为「" + label + "」，key 可用" + (count ? "，已载入 " + count + " 个图像模型。" : "。");
      } catch (error) {
        if (revision !== diagnosticRevision || !result.isConnected) return;
        const safe = GraphicAPI.errorInfo(error);
        result.textContent = "❌ " + safe.title + "：" + safe.message + " " + safe.hint;
      } finally { button.disabled = false; }
    };
    q("#api-workflow-file").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        if (file.size > 2 * 1024 * 1024) throw new Error("ComfyUI API workflow 不能超过 2 MiB");
        const raw = await file.text();
        GraphicAPISettings.validateWorkflow(raw);
        workflowJson = raw;
        workflowStatus();
        q("#api-settings-error").textContent = "";
      } catch (error) {
        workflowJson = "";
        q("#api-workflow-status").textContent = "未导入：" + (error.message || "workflow 格式无效");
      } finally { event.target.value = ""; }
    });
    protocol();
    q("#api-protocol").onchange = protocol;
    q("#api-key").addEventListener("input", () => {
      diagnosticRevision++;
      q("#api-models-result").textContent = "";
      q("#api-key-result").textContent = "";
    });
    q("#api-check-models").onclick = async () => {
      const button = q("#api-check-models"), result = q("#api-models-result");
      if (q("#api-protocol").value !== "sensenova-proxy" || button.disabled) return;
      const revision = ++diagnosticRevision;
      button.disabled = true;
      result.textContent = "正在只读检查模型列表；不会调用生图接口…";
      try {
        const checked = await GraphicAPI.checkSenseNovaModels(q("#api-key").value);
        if (revision !== diagnosticRevision || !result.isConnected) return;
        result.textContent = "当前表单 key 可访问模型列表（" + checked.count + " 个模型）；" +
          (checked.hasRequiredModel ? "包含 sensenova-u1.5-lite。" : "未包含 sensenova-u1.5-lite。") +
          "仅验证列表读取，不证明生图权限；未发送生图请求。";
      } catch (error) {
        if (revision !== diagnosticRevision || !result.isConnected) return;
        const safe = GraphicAPI.errorInfo(error);
        result.textContent = safe.title + "：" + safe.message + " " + safe.hint;
      } finally { button.disabled = false; }
    };
    ["#api-base-url", "#api-generate-path", "#api-edit-path", "#api-vectorize-path"].forEach(id => q(id).addEventListener("input", preview));
    q("#api-toggle-key").onclick = () => {
      const show = q("#api-key").type === "password";
      q("#api-key").type = show ? "text" : "password";
      q("#api-toggle-key").textContent = show ? "隐藏" : "显示";
      q("#api-toggle-key").setAttribute("aria-pressed", String(show));
      q("#api-toggle-key").setAttribute(
        "aria-label",
        show ? "隐藏 API key" : "显示 API key",
      );
    };
    q("#api-clear").onclick = () => {
      try {
        GraphicAPISettings.clear();
        q("#api-key").value = "";
        refresh();
        q("#dialog").close();
        toast("API 配置已清除，已切换到本地 demo");
      } catch (_) {
        q("#api-settings-error").textContent =
          "浏览器无法清除会话存储，请检查站点权限。";
      }
    };
    q("#api-settings-form").onsubmit = (e) => {
      e.preventDefault();
      const enabled = q("#api-enabled").checked;
      if (enabled && !q("#api-consent").checked) {
        q("#api-settings-error").textContent =
          "请先确认所选服务的传输与费用说明。";
        return;
      }
      const next = { enabled, protocol: q("#api-protocol").value };
      Object.entries(fields).forEach(([key, id]) => {
        next[key] = q("#" + id).value.trim();
      });
      next.workflowJson = next.protocol === "comfyui-api" ? workflowJson : "";
      next.provider = next.protocol === "multi-proxy" ? q("#api-provider").value : "";
      next.watermark = q("#api-watermark").checked;
      next.remember = q("#api-remember").checked;
      try {
        GraphicAPISettings.save(next);
        q("#api-key").value = "";
        refresh();
        q("#dialog").close();
        toast(
          enabled
            ? (next.remember ? "API 设置已保存在这台设备；尚未发送请求" : "API 设置已保存到本标签页；尚未发送请求")
            : "已保存设置并使用本地 demo",
        );
      } catch (error) {
        q("#api-settings-error").textContent =
          error.message || "设置无效，请检查必填字段。";
      }
    };
    // Remove credentials from detached/closed dialog DOM; never keep them in work state.
    q("#dialog").addEventListener(
      "close",
      () => {
        const key = q("#api-key");
        if (key) key.value = "";
      },
      { once: true },
    );
  }
  window.GraphicAPISettingsUI = { open, refresh };
  q("#api-help").onclick = open;
  refresh();
})();
