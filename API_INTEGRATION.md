# Graphic API 集成说明

本项目的前端 API 边界由 `public/api-config.js` 和 `public/api-adapter.js` 提供。默认配置为 **demo 模式**：不发起网络请求、不需要密钥、不接入付费服务；`generate`、`edit`、`vectorize` 在该模式下会抛出 `API_NOT_CONFIGURED`，父页面应继续使用本地示例模板。

## 配置位置

在部署自己的后端时，只修改 `public/api-config.js` 中的配置（不要把密钥放进这里）：

```js
window.GRAPHIC_API_CONFIG = {
  mode: 'demo', // 只有明确部署后端后才改为 'remote'
  baseUrl: '',  // 必须是本站相对路径，例如 /api
  timeoutMs: 30000,
  endpoints: {
    generate: '',
    edit: '',
    vectorize: '',
    session: '',
    works: '',
    checkout: ''
  }
};
```

`remote` 模式的 `baseUrl` 和 endpoint 必须是本站同源相对路径；不接受 `http://`、`https://`、`//host` 或反斜杠路径。适配器使用 `same-origin` 凭据、超时和 `AbortSignal` 取消请求，并把网络、取消、HTTP 和响应格式错误统一成带 `code` 的 `GraphicAPIError`。

## 前端调用方式（给 `app.js`）

```js
var request = {
  tool: 'generate',
  brand: '示例品牌',
  concept: '简洁、可靠',
  style: 'modern',
  color: '#111827',
  subtitle: '',
  description: '一个抽象的字母标志',
  references: [],
  sourceImage: '',
  platform: 'web',
  scene: 'brand',
  intelligence: 'balanced',
  count: 4
};

try {
  var result = await window.GraphicAPI.generate(request, { signal: controller.signal });
  // result.items: [{ id, imageUrl, name }]
} catch (error) {
  if (error.code === 'API_NOT_CONFIGURED') {
    // demo 模式：渲染 app.js 自己的本地模板，不显示网络失败
  } else if (error.code === 'REQUEST_CANCELLED') {
    // 用户主动取消或超时
  } else {
    // 展示统一的 error.message
  }
}
```

同样地，调用 `GraphicAPI.edit(input, { signal })` 或 `GraphicAPI.vectorize(input, { signal })`。`GraphicAPI.buildRequest(input)` 会保留以下契约字段：`tool`、`brand`、`concept`、`style`、`color`、`subtitle`、`description`、`references`、`sourceImage`、`platform`、`scene`、`intelligence`、`count`。`GraphicAPI.status()` 返回 `{ mode, configured, demo }`。

## 前后端契约

请求为 `POST` JSON，响应必须为：

```json
{
  "items": [
    { "id": "logo-1", "imageUrl": "/assets/logo-1.png", "name": "方案一" }
  ]
}
```

`items` 中每个对象的 `id` 和 `name` 必须是字符串。`imageUrl` 只接受：

- `data:image/png|jpeg|webp|gif|avif;base64,...` 栅格图 Data URL；或
- 以 `/` 开头、指向本站栅格图片文件的相对路径（`.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`、`.avif`）。

适配器拒绝 SVG、远端 URL、协议相对 URL、原始 HTML 和不符合契约的响应，避免将不可信内容作为图像或 HTML 注入页面。前端渲染仍应使用 `img.src`，不要使用 `innerHTML` 拼接服务端返回值。

## 安全与预留范围

- **鉴权密钥只存后端**：浏览器端配置和请求中不得放 API key、私钥或供应商密钥。后端负责会话、鉴权、限流、供应商调用和日志脱敏。
- `session`、`works`、`checkout` endpoint 仅作为未来契约预留，本次不实现账号、登录、作品云端同步或支付流程。
- 本次不连接任何真实远端，也不测试真实远端；切换到 `remote` 前应由项目维护者提供同源后端并完成安全审查。

## 默认模板与真实 AI 的区别

默认模板是前端本地示例数据，用于无网络、无付费、无密钥演示；它不代表真实模型生成能力，也不会调用 AI 服务。真实 AI 模式需要后端实现上述请求/响应契约，承担模型调用、鉴权、费用、配额、内容安全和错误处理。前端适配器只负责安全地传输契约数据和校验返回的栅格图结果，不承诺或模拟真实 AI 质量。
