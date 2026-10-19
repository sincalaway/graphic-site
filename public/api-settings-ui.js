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
      ? `${s.protocol || "同源 API"} · ${s.model || "已配置"} · 服务商可能计费`
      : "未配置 API · 当前仅本地模板演示，不扣费";
    q("#api-help").textContent = remote ? "管理 API ↗" : "配置 API ↗";
    q(".canvas-status").textContent = remote
      ? "使用你的 API · 浏览器直连 / 自有后端"
      : "API 未配置 · 本地演示";
    q(".generate-hint").textContent = remote
      ? "真实 API · 提示词与参考图将发送到所选服务"
      : "本地模板 · 非 AI 生成 · 不扣费";
    q("#credits").textContent = remote ? "服务商计费" : "演示 · 不扣费";
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
    dialog(`<p class="flow-kicker">YOUR API / YOUR CHOICE</p><h2>接入你的生成服务</h2><p class="hint">不预设服务商或模型。保存仅校验配置，不发请求；点击生成才会使用 API。</p>
      <form id="api-settings-form" autocomplete="off">
      <label class="checkline"><input type="checkbox" id="api-enabled" ${c.enabled ? "checked" : ""}>启用真实 API（关闭则使用 demo）</label>
      <label class="form-label">协议 <span class="required">*</span><select id="api-protocol"><option value="openai-images">OpenAI 兼容 Images（非 Chat / Responses）</option><option value="graphic-json">Graphic 自有 JSON 契约</option></select></label>
      <p class="notice" id="api-protocol-note"></p>
      <label class="form-label">服务地址 / API 前缀 <span class="required">*</span><input id="api-base-url" type="url" placeholder="https://your-service.example/v1" spellcheck="false" maxlength="2000"></label>
      <p class="hint">填写服务商文档中的 API 前缀（需要 /v1 时请自行包含）。仅 HTTPS 或 localhost HTTP，不允许 URL 中包含密钥、账号、查询或片段。</p>
      <p class="notice" id="api-request-preview" aria-live="polite" style="overflow-wrap:anywhere;white-space:pre-line"></p>
      <label class="form-label">模型 ID <span class="required">*</span><input id="api-model" placeholder="填写该服务支持的图像模型 ID" spellcheck="false" maxlength="200"></label>
      <label class="form-label" id="api-key-label">API key <span id="api-key-required">*</span><span class="api-key-row"><input id="api-key" type="password" autocomplete="new-password" spellcheck="false" placeholder="只保存在本标签页会话，不写入仓库" maxlength="4096"><button type="button" class="secondary" id="api-toggle-key" aria-label="显示 API key" aria-pressed="false">显示</button></span></label>
      <div id="api-custom-paths"><label class="form-label">生成路径（必填）<input id="api-generate-path" placeholder="/generate"></label><label class="form-label">续改路径（可选，空白表示不支持）<input id="api-edit-path" placeholder="/edit"></label><label class="form-label">转换路径（可选，空白表示不支持）<input id="api-vectorize-path" placeholder="留空则禁用远端转换"></label><p class="hint">均相对于上面的服务前缀；后端必须实现仓库 API_INTEGRATION.md 中的自有 JSON 契约。返回栅格图片，不等同于真正 SVG 路径。</p></div>
      <div class="notice"><b>浏览器端安全边界</b><p>API key 会通过 Authorization: Bearer 发给你填写的服务地址。提示词、品牌信息及使用的参考图 / 手稿 / 源图也会发送给该服务，可能产生费用。请核对域名与隐私政策。</p><p>配置仅存 sessionStorage（本标签页会话，刷新保留；浏览器恢复或复制标签页可能保留）。页面脚本、扩展或 XSS 可以读取 key，这不是服务器端保密。建议使用低额度临时 key，或自己的后端代理；不要在共享设备上保留。</p><p>跨域服务与返回的图片地址必须允许浏览器 CORS。保存不测试连通性，不验证额度。生成失败不自动重试、不静默退回 demo。</p></div>
      <label class="checkline"><input type="checkbox" id="api-consent">我了解 key 与输入内容会发给所选服务，并确认该地址可信、可能计费。</label>
      <p id="api-settings-error" role="alert" class="api-settings-error"></p><div class="api-settings-actions"><button type="submit" class="login-btn">保存设置</button><button type="button" id="api-clear" class="secondary">清除配置并使用 demo</button></div></form>`);
    q("#api-protocol").value = c.protocol || "openai-images";
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
    function protocol() {
      const custom = q("#api-protocol").value === "graphic-json";
      q("#api-custom-paths").hidden = !custom;
      q("#api-key-required").textContent = custom
        ? "（可选：仅限无需 Bearer 的自有服务）"
        : "*";
      q("#api-protocol-note").textContent = custom
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
        const prefix = url.origin + url.pathname.replace(/\/$/, "");
        const openai = q("#api-protocol").value === "openai-images";
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
    protocol();
    q("#api-protocol").onchange = protocol;
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
      try {
        GraphicAPISettings.save(next);
        q("#api-key").value = "";
        refresh();
        q("#dialog").close();
        toast(
          enabled
            ? "API 设置已保存到本标签页；尚未发送请求"
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
