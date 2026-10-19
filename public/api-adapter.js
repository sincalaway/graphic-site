(function (global) {
  "use strict";
  var DEFAULT_TIMEOUT = 30000,
    USER_TIMEOUT = 180000,
    MAX_IMAGE = 20 * 1024 * 1024;
  var ENDPOINT_KEYS = [
    "generate",
    "edit",
    "vectorize",
    "session",
    "works",
    "checkout",
    "task",
  ];
  var contract = global.GraphicAPIContract;
  function ApiError(code, message, details) {
    this.name = "GraphicAPIError";
    this.code = code;
    this.message = message;
    if (details !== undefined) this.details = details;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ApiError);
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;
  function cfg() {
    return (
      global.GRAPHIC_API_CONFIG || {
        mode: "demo",
        baseUrl: "",
        timeoutMs: DEFAULT_TIMEOUT,
        provider: "",
        model: "",
        endpoints: {},
      }
    );
  }
  function settings() {
    try {
      return global.GraphicAPISettings && global.GraphicAPISettings.get
        ? global.GraphicAPISettings.get()
        : null;
    } catch (_) {
      return null;
    }
  }
  function path(v, optional) {
    if (optional && v === "") return true;
    return (
      typeof v === "string" &&
      /^\/[A-Za-z0-9._~/-]*$/.test(v) &&
      v.indexOf("//") < 0 &&
      v.indexOf("%") < 0 &&
      v.indexOf("\\") < 0 &&
      !/(^|\/)\.{1,2}(\/|$)/.test(v)
    );
  }
  function userBase(v) {
    if (
      typeof v !== "string" ||
      !v ||
      /[\x00-\x20\\%?#]/.test(v) ||
      !/^(?:https:\/\/|http:\/\/)/i.test(v)
    )
      return false;
    var rawPath = v.replace(/^[a-z]+:\/\/[^\/]*(\/.*)?$/i, "$1") || "/";
    if (/(^|\/)\.{1,2}(\/|$)/.test(rawPath)) return false;
    try {
      var u = new URL(v);
      return (
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash &&
        (u.protocol === "https:" ||
          (u.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].indexOf(u.hostname) >= 0)) &&
        path(u.pathname || "/")
      );
    } catch (_) {
      return false;
    }
  }
  function legacyConfigured(op) {
    var c = cfg(),
      e = c.endpoints && c.endpoints[op];
    return (
      c.mode === "remote" && path(c.baseUrl) && typeof e === "string" && path(e)
    );
  }
  function userConfigured(s, op) {
    if (!s || !s.enabled || !userBase(s.baseUrl) || !s.model) return false;
    if (s.protocol === "openai-images")
      return op !== "vectorize" && (op === "generate" || op === "edit");
    return s.protocol === "graphic-json" && path(s[op + "Path"], false);
  }
  function active(op) {
    var s = settings();
    if (s && s.enabled) {
      if (!userConfigured(s, op)) {
        if (s.protocol === "openai-images" && op === "vectorize")
          throw new ApiError(
            "API_VECTORIZE_UNSUPPORTED",
            "openai-images 不支持矢量化",
          );
        throw new ApiError("API_CONFIG_INVALID", "用户 API 设置无效");
      }
      return { kind: "user", value: s };
    }
    if (legacyConfigured(op)) return { kind: "legacy", value: cfg() };
    return null;
  }
  function joinLegacy(c, op) {
    var b = c.baseUrl === "/" ? "" : c.baseUrl.replace(/\/$/, "");
    return (
      b +
      (c.endpoints[op].charAt(0) === "/"
        ? c.endpoints[op]
        : "/" + c.endpoints[op])
    );
  }
  function joinUser(s, op) {
    var u = new URL(s.baseUrl),
      p = s[op + "Path"];
    u.pathname = (u.pathname.replace(/\/$/, "") || "") + p;
    u.search = "";
    u.hash = "";
    return u.href;
  }
  function openaiUrl(s, suffix) {
    var u = new URL(s.baseUrl);
    u.pathname = (u.pathname.replace(/\/$/, "") || "") + suffix;
    u.search = "";
    u.hash = "";
    return u.href;
  }
  function normalize(e, timedOut) {
    if (timedOut) return new ApiError("REQUEST_TIMEOUT", "API 请求超时");
    if (e instanceof ApiError) return e;
    if (e && e.name === "AbortError")
      return new ApiError("REQUEST_CANCELLED", "请求已取消");
    return new ApiError("NETWORK_ERROR", "API 请求失败");
  }
  function text(v) {
    return v === undefined || v === null ? "" : String(v);
  }
  function promptFor(r) {
    var labels = {
      tool: "工具",
      brand: "品牌",
      concept: "概念",
      style: "风格",
      styleIndex: "风格编号",
      color: "主色",
      subtitle: "副标题",
      description: "补充描述",
      platform: "平台",
      scene: "场景",
      intelligence: "智能档位",
    };
    return (
      Object.keys(labels)
        .map(function (k) {
          return labels[k] + ": " + text(r[k]);
        })
        .filter(function (x) {
          return x.slice(x.indexOf(":") + 2);
        })
        .join("\n") + "\n请生成符合以上全部输入的设计方案。"
    );
  }
  function imageType(type) {
    return /^image\/(png|jpeg|webp|gif|avif)$/i.test(type || "");
  }
  function bytesToData(bytes, type) {
    var bin = "",
      i;
    for (i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    var b64 = typeof btoa === "function" ? btoa(bin) : "";
    return "data:" + (type || "image/png") + ";base64," + b64;
  }
  async function blobData(blob) {
    if (!blob || blob.size > MAX_IMAGE || !imageType(blob.type))
      throw new ApiError("INVALID_REQUEST", "参考图格式或大小无效");
    if (typeof FileReader !== "undefined")
      return await new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onload = function () {
          resolve(String(r.result));
        };
        r.onerror = function () {
          reject(new ApiError("IMAGE_FETCH_FAILED", "参考图无法读取"));
        };
        r.readAsDataURL(blob);
      });
    if (blob.arrayBuffer)
      return bytesToData(new Uint8Array(await blob.arrayBuffer()), blob.type);
    throw new ApiError("IMAGE_FETCH_FAILED", "参考图无法读取");
  }
  function imageUrlSafe(v) {
    if (typeof v !== "string") return false;
    if (/^data:image\/(png|jpeg|jpg|webp|gif|avif);base64,/i.test(v))
      return true;
    try {
      var u = new URL(
        v,
        (global.location && global.location.origin) || "http://graphic.invalid",
      );
      return (
        (u.protocol === "https:" ||
          (v.charAt(0) === "/" &&
            v.charAt(1) !== "/" &&
            u.origin === (global.location && global.location.origin))) &&
        !u.username &&
        !u.password
      );
    } catch (_) {
      return false;
    }
  }
  async function rasterize(value, signal) {
    if (typeof value !== "string") return value;
    if (/^data:image\/(png|jpeg|jpg|webp|gif|avif);base64,/i.test(value))
      return value;
    if (!/^(?:https?:\/\/|\/)/i.test(value))
      throw new ApiError("INVALID_REQUEST", "参考图格式无效");
    var response;
    try {
      response = await fetch(value, {
        credentials: "omit",
        redirect: "error",
        signal: signal,
      });
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      throw new ApiError("IMAGE_FETCH_FAILED", "参考图无法读取");
    }
    if (!response || !response.ok)
      throw new ApiError("IMAGE_FETCH_FAILED", "参考图无法读取");
    try {
      return await blobData(await response.blob());
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError("IMAGE_FETCH_FAILED", "参考图无法读取");
    }
  }
  async function prepareImages(r, signal) {
    var out = Object.assign({}, r),
      refs = Array.isArray(r.references) ? r.references : [];
    if (r.sourceImage) out.sourceImage = await rasterize(r.sourceImage, signal);
    if (refs.length) {
      out.references = [];
      for (var i = 0; i < refs.length; i++)
        out.references.push(await rasterize(refs[i], signal));
    }
    return out;
  }
  function openaiPayload(r, s) {
    var images = [];
    if (r.sourceImage) images.push(r.sourceImage);
    if (Array.isArray(r.references)) images = images.concat(r.references);
    var n = r.count === undefined ? 1 : r.count;
    return {
      payload: { model: s.model, prompt: promptFor(r), n: n },
      images: images,
    };
  }
  function parseOpenAI(body) {
    if (
      !body ||
      !Array.isArray(body.data) ||
      !body.data.length ||
      body.data.length > 10
    )
      throw new ApiError("INVALID_RESPONSE", "API 响应格式无效");
    return {
      items: body.data.map(function (x, i) {
        var image =
          x && x.b64_json ? "data:image/png;base64," + x.b64_json : x && x.url;
        if (!image || !imageUrlSafe(image))
          throw new ApiError("INVALID_RESPONSE", "API 响应格式无效");
        return {
          id: "image-" + (i + 1),
          name: "方案 " + (i + 1),
          imageUrl: image,
        };
      }),
    };
  }
  async function downloadItems(payload, signal) {
    if (
      !payload ||
      !Array.isArray(payload.items) ||
      payload.items.length < 1 ||
      payload.items.length > 10
    )
      throw new ApiError("INVALID_RESPONSE", "API 响应缺少有效的 items 数组");
    var out = { items: [] };
    for (var i = 0; i < payload.items.length; i++) {
      var item = payload.items[i];
      if (
        item &&
        typeof item.imageUrl === "string" &&
        !/^data:/i.test(item.imageUrl)
      ) {
        if (!imageUrlSafe(item.imageUrl))
          throw new ApiError("INVALID_RESPONSE", "API 响应包含不安全图像");
        var absolute = /^https?:\/\//i.test(item.imageUrl);
        if (absolute) {
          var u = new URL(item.imageUrl);
          var res;
          try {
            res = await fetch(u.href, {
              credentials: "omit",
              redirect: "error",
              signal: signal,
            });
          } catch (e) {
            if (e && e.name === "AbortError") throw e;
            throw new ApiError("IMAGE_FETCH_FAILED", "API 返回图像无法读取");
          }
          if (!res || !res.ok)
            throw new ApiError("IMAGE_FETCH_FAILED", "API 返回图像无法读取");
          item = Object.assign({}, item, {
            imageUrl: await blobData(await res.blob()),
          });
        }
      }
      out.items.push(item);
    }
    return out;
  }
  async function request(op, input, options) {
    var selected = active(op),
      opts = options || {},
      external = opts.signal;
    if (!selected)
      throw new ApiError(
        "API_NOT_CONFIGURED",
        "当前为 demo 模式，未配置真实 API；请使用本地示例数据",
      );
    if (external && external.aborted)
      throw new ApiError("REQUEST_CANCELLED", "请求已取消");
    var c = selected.value,
      controller =
        typeof AbortController !== "undefined" ? new AbortController() : null,
      timedOut = false,
      timer = null;
    function abort() {
      if (controller) controller.abort();
    }
    if (external && external.addEventListener)
      external.addEventListener("abort", abort, { once: true });
    var timeout = selected.kind === "user" ? USER_TIMEOUT : Number(c.timeoutMs);
    if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 300000)
      timeout = DEFAULT_TIMEOUT;
    timer = setTimeout(function () {
      timedOut = true;
      if (controller) controller.abort();
    }, timeout);
    try {
      var raw = contract.validateRequest(input);
      raw =
        selected.kind === "user"
          ? await prepareImages(raw, controller ? controller.signal : external)
          : contract.validateRequest(raw);
      raw = contract.validateRequest(raw);
      var url,
        headers = { Accept: "application/json" },
        body;
      var isOpen = selected.kind === "user" && c.protocol === "openai-images",
        p = isOpen ? openaiPayload(raw, c) : null;
      if (isOpen) {
        var hasImages = p.images.length;
        if (op === "edit" && !hasImages)
          throw new ApiError("INVALID_REQUEST", "编辑操作需要图片");
        url = openaiUrl(c, hasImages ? "/images/edits" : "/images/generations");
        headers.Authorization = "Bearer " + c.apiKey;
        if (hasImages) {
          var form = new FormData();
          form.append("model", c.model);
          form.append("prompt", p.payload.prompt);
          form.append("n", String(p.payload.n));
          for (var j = 0; j < p.images.length; j++) {
            var data = p.images[j],
              parts = data.split(","),
              bin = atob(parts[1]),
              arr = new Uint8Array(bin.length),
              k;
            for (k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
            form.append(
              "image[]",
              new Blob([arr], {
                type:
                  (parts[0].match(/^data:([^;]+)/i) || [])[1] || "image/png",
              }),
              "reference-" +
                (j + 1) +
                "." +
                (
                  (parts[0].match(/^data:image\/([^;]+)/i) || [])[1] || "png"
                ).replace("jpeg", "jpg"),
            );
          }
          body = form;
        } else {
          headers["Content-Type"] = "application/json";
          body = JSON.stringify(p.payload);
        }
      } else {
        url = selected.kind === "legacy" ? joinLegacy(c, op) : joinUser(c, op);
        headers["Content-Type"] = "application/json";
        if (selected.kind === "user" && c.apiKey)
          headers.Authorization = "Bearer " + c.apiKey;
        body = JSON.stringify(
          selected.kind === "user"
            ? Object.assign({ model: c.model }, raw)
            : raw,
        );
      }
      var response;
      try {
        response = await fetch(url, {
          method: "POST",
          credentials: selected.kind === "user" ? "omit" : "same-origin",
          redirect: "error",
          headers: headers,
          body: body,
          signal: controller ? controller.signal : external,
        });
      } catch (e) {
        throw e;
      }
      if (!response || !response.ok)
        throw new ApiError(
          "HTTP_ERROR",
          "API 请求失败（HTTP " + ((response && response.status) || 0) + "）",
          { status: response && response.status },
        );
      var result;
      try {
        result = await response.json();
      } catch (e) {
        if (e && e.name === "AbortError") throw e;
        throw new ApiError("INVALID_RESPONSE", "API 未返回 JSON");
      }
      var parsed = isOpen ? parseOpenAI(result) : result;
      parsed = await downloadItems(
        parsed,
        controller ? controller.signal : external,
      );
      if (
        (controller && controller.signal.aborted) ||
        (external && external.aborted)
      ) {
        var cancelled = new Error("取消");
        cancelled.name = "AbortError";
        throw cancelled;
      }
      return contract.validateItems(
        parsed,
        global.location && global.location.origin,
      );
    } catch (e) {
      throw normalize(e, timedOut);
    } finally {
      if (timer) clearTimeout(timer);
      if (external && external.removeEventListener)
        external.removeEventListener("abort", abort);
    }
  }
  var api = {
    status: function () {
      var c = cfg(),
        s = settings(),
        operations = {};
      ENDPOINT_KEYS.forEach(function (k) {
        operations[k] = !!(s && s.enabled
          ? userConfigured(s, k)
          : legacyConfigured(k));
      });
      var user = !!(
        s &&
        s.enabled &&
        ["graphic-json", "openai-images"].indexOf(s.protocol) >= 0
      );
      return {
        mode: user ? "remote" : c.mode === "remote" ? "remote" : "demo",
        configured: !!operations.generate,
        demo: !user && c.mode !== "remote",
        operations: operations,
        provider: user ? "" : typeof c.provider === "string" ? c.provider : "",
        model: user ? s.model : typeof c.model === "string" ? c.model : "",
        protocol: user ? s.protocol : "",
        baseUrl: user
          ? s.baseUrl
          : typeof c.baseUrl === "string"
            ? c.baseUrl
            : "",
      };
    },
    buildRequest: contract.buildRequest,
    options: function () {
      var c = cfg(),
        list =
          c.options && Array.isArray(c.options.intelligence)
            ? c.options.intelligence.map(function (x) {
                return Object.freeze({
                  id: x.id,
                  label: x.label,
                  description: x.description,
                });
              })
            : [];
      return Object.freeze({ intelligence: Object.freeze(list) });
    },
    taskQuery: contract.validateTaskQuery,
    generate: function (i, o) {
      return request("generate", i, o);
    },
    edit: function (i, o) {
      return request("edit", i, o);
    },
    vectorize: function (i, o) {
      return request("vectorize", i, o);
    },
  };
  global.GraphicAPI = api;
})(typeof window !== "undefined" ? window : globalThis);
