# Graphic API 集成说明

本项目的 API 边界由 `public/api-config.js`、`public/api-contract.js` 和 `public/api-adapter.js` 提供。它是**本项目自有的前端契约**，不是原站后端文档：公开原站仅能证明存在智能/专家等档位元数据和生成客户端流程，无法证明具体供应商、模型、接口或成功推理结果。因此当前不声称接入 AI。

## 默认状态

默认 `mode: 'demo'`，所有业务 endpoint、`provider`、`model` 均为空；不会发起网络请求、不读取密钥、不扣费。现有 `app.js` / `full-flow.js` 的本地模板流程保持不变，`GraphicAPI.generate/edit/vectorize` 在 demo 模式只返回 `API_NOT_CONFIGURED`，调用方继续走本地演示。

配置示例（仅供未来自有同源后端使用，不能填供应商密钥）：

```js
window.GRAPHIC_API_CONFIG = {
  mode: 'demo', provider: '', model: '', baseUrl: '', timeoutMs: 30000,
  endpoints: { generate: '', edit: '', vectorize: '', session: '', works: '', checkout: '', task: '' },
  options: { intelligence: [
    { id: 'fast', label: '快捷' }, { id: 'smart', label: '智能' }, { id: 'pro', label: '专家' }
  ] }
};
```

## 契约与调用兼容性

`GraphicAPI.buildRequest(input)` 继续保留既有字段：`tool`、`brand`、`concept`、`style`、`styleIndex`、`color`、`subtitle`、`description`、`references`、`sourceImage`、`platform`、`scene`、`intelligence`、`count`；未知字段会丢弃。`full-flow.js` 的 UI 工具名 `vectorizer` 会在传输契约中兼容映射为 `vectorize`；`references` 必须是最多 5 项的 png/jpeg/webp/gif/avif Base64 Data URL 数组（前端本地引用图正是此格式）。显式远程调用时，契约会校验工具枚举、文本长度/控制字符、`count`（1–10）、`styleIndex`（0–9）、档位、参考图数量和本站图像格式。

远端请求为 `POST` JSON，响应契约为：

```json
{ "items": [{ "id": "logo-1", "imageUrl": "/assets/logo-1.png", "name": "方案一" }] }
```

仅接受本站同源栅格图片路径或 png/jpeg/webp/gif/avif Data URL；拒绝 SVG、外链、协议相对 URL 和不安全路径。前端渲染仍应使用安全的 `img.src`，不要把服务端值拼入 HTML。

## 传输安全

- `baseUrl` 与 endpoint 必须是无查询/片段、无反斜杠、无协议、无协议相对形式、无 `.`/`..` 路径段的本站绝对路径；只允许 ASCII 字母、数字、`/`、`.`、`_`、`-`、`~`，因此拒绝所有 `%` 编码（包括 `%2e%2e` 与双编码）及其他非安全路径字符。每个操作单独校验，不能用 generate 的配置冒充其他操作。
- 使用 `credentials: 'same-origin'`、`redirect: 'error'`、超时和外部 `AbortSignal`；超时为 `REQUEST_TIMEOUT`，主动取消为 `REQUEST_CANCELLED`。
- HTTP 状态先于 JSON 解析处理（错误响应 JSON 仅作可选错误信息）；成功响应再严格校验 JSON。网络失败、HTTP 错误和响应格式错误均返回带 `code` 的 `GraphicAPIError`。
- 不自动重试，尤其不重试可能计费的生成、编辑和矢量化请求。密钥只能存自有后端环境变量。

## 只读预留范围

`GraphicAPI.options()` 只读返回 UI 档位元数据，不证明模型存在或已接入。`GraphicAPI.taskQuery(input)` 只校验未来任务查询输入（`taskId`、`cursor`、`limit`），不发请求、不实现轮询，也不猜测原站任务 schema。`session`、`works`、`checkout` 和 `task` endpoint 仅为空配置预留，本次不实现账号、作品同步、支付或真实任务服务。

切换到 `remote` 前，项目维护者必须提供并审查自己的同源后端、鉴权、限流、费用、内容安全和响应实现；本项目不会据此宣称任何真实模型推理成功。
