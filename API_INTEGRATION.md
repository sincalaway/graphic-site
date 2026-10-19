# Graphic API 集成说明

本文档描述 Graphic 的**浏览器 API 配置 UI 优先**路径，以及仍保留的高级静态同源模式。它们都是本项目自己的适配边界，不是原站后端文档；公开资料无法证明具体供应商、模型、私有接口或成功推理结果。

## 1. 默认状态与 UI 入口

默认模式为 `demo`，不发起网络请求。顶部状态栏 **“配置 API”** 和“更多”菜单的 **“API 接入状态”** 打开同一个面板。面板可填写：

- 协议：`graphic-json` 或 `openai-images`；也可清除后回到 `demo`。
- `baseUrl`：服务地址。
- `model`：模型名。
- `apiKey`：密钥（按协议要求）。
- `generatePath`、`editPath`：生成/编辑路径。
- `vectorizePath`：可选的自有 `graphic-json` 矢量化路径。

保存只做本地校验，不做连通性测试、不收费、不发请求。首次点击生成或编辑才请求；失败会显示错误，**不自动重试，也不默默回退 demo**。默认请求超时为 **180 秒**，可取消；取消仅停止浏览器等待，不保证服务端撤销生成或费用。

配置仅保存到当前标签页的 `sessionStorage`：刷新通常保留，关闭标签页通常清除；浏览器恢复标签页或复制标签页可能恢复/复制会话数据，不能把它当作严格的密钥清除保证。清除按钮清空配置并回到 demo。

## 2. 支持矩阵

| 能力/限制 | demo | graphic-json | openai-images |
|---|---|---|---|
| 默认状态 | 是 | 否 | 否 |
| 传输 | 无 | `POST` JSON | OpenAI 兼容 Images API |
| `baseUrl` | 不适用 | 必填 | 必填；应已含 `/v1` 或对应 API 前缀，**不会自动补** |
| `model` | 不适用 | 必填 | 必填；不假定具体模型 |
| Bearer key | 不发送 | 可选 | 必填 |
| 生成路径 | 不请求 | 默认 `/generate` | `/images/generations` |
| 编辑路径 | 不请求 | 默认 `/edit` | `/images/edits`（有 `sourceImage` 或 `references` 时） |
| `vectorize` | 本地/demo 行为 | 可选 `vectorizePath` | 明确不支持，返回 `API_VECTORIZE_UNSUPPORTED` |
| 参考图/源图 | 本地保留 | JSON 中发送 | 生成无图时 JSON；有 `sourceImage` 或 `references` 时使用 multipart `image[]` |
| 返回 | 本地演示 | `items` 栅格结果 | `data[].b64_json` 或 `data[].url`，转为栅格 Data URL |

`openai-images` 是 OpenAI **Images 协议兼容**适配，不是“任意供应商 API”适配。供应商必须支持对应的路径、`model`、`n` 以及实际发送的图片字段；项目不替供应商猜测模型名或字段兼容性。`vectorize` 不会伪装成编辑或生成。

## 3. `graphic-json` 协议

这是项目自有的 JSON 契约。地址必须为 HTTPS，或仅在本机开发时使用 `http://localhost`、`http://127.0.0.1`、`http://[::1]`（允许端口）；不允许其他 HTTP 地址。

默认路径：`/generate`、`/edit`；`vectorizePath` 由用户显式填写后才可用。路径是相对 `baseUrl` 的 API 路径，不是另一个 origin。

### 请求

生成和编辑均为 `POST`，`Content-Type: application/json`。Bearer key 有值时发送 `Authorization: Bearer <key>`；留空则不发送该 header。

```json
{
  "model": "your-model-id",
  "tool": "logo",
  "brand": "Acme",
  "concept": "友好、可靠的环保品牌",
  "style": "minimal",
  "styleIndex": 0,
  "color": "#111827",
  "subtitle": "",
  "description": "几何叶片标志",
  "references": ["data:image/png;base64,..."],
  "sourceImage": "data:image/png;base64,...",
  "platform": "ios",
  "scene": "desk",
  "intelligence": "smart",
  "count": 1
}
```

实际字段仍受 `public/api-contract.js` 校验：`tool`、`brand`、`concept`、`style`、`styleIndex`、`color`、`subtitle`、`description`、`references`、`sourceImage`、`platform`、`scene`、`intelligence`、`count`。`vectorizer` 在传输时兼容映射为 `vectorize`。`references` 最多 5 项，必须是受支持的图片 Data URL；无关未知字段不应依赖。

### 响应

```json
{
  "items": [
    { "id": "logo-1", "imageUrl": "data:image/png;base64,...", "name": "方案一" }
  ]
}
```

`items` 必须是结果数组，结果图必须最终可校验为 PNG/JPEG/WebP/GIF/AVIF 栅格图：可以是图片 Data URL、同源安全栅格路径，或允许 CORS 读取的 HTTPS 图片地址（先转为 Data URL）。`graphic-json` 的 `vectorize` 仍返回栅格容器，**不是 SVG 路径描摹**。拒绝 SVG、不安全路径、非 HTTPS 外链、协议相对 URL 和无法读取的图片。

## 4. `openai-images` 协议

这是 OpenAI 兼容 Images API 的浏览器适配。`baseUrl` 必须由用户写成实际 API 前缀（例如已含 `/v1`）；适配器不会自动追加 `/v1`、`/images` 或其他路径。`model` 和 key 必填；不假定 `dall-e-*` 或其他具体模型。

- **无 `sourceImage`、无 `references` 的生成**：向 `baseUrl + /images/generations` 发送 JSON，请求包含项目映射的 `prompt`、`model`、`n` 及供应商支持的相关图片字段。
- **存在 `sourceImage` 或 `references` 的生成/编辑**：向 `baseUrl + /images/edits` 发送 `multipart/form-data`，图片字段使用 `image[]`；不要手工覆盖浏览器自动生成的 multipart boundary。
- 发送 `Authorization: Bearer <key>`。提示词、参考图和源图会随请求发送。
- 响应接受 `data[].b64_json` 或 `data[].url`。`b64_json` 转成栅格 Data URL；`url` 必须下载并转成栅格 Data URL 后再校验，不能直接信任外链。
- `url` 下载和浏览器显示都需要目标服务器允许 CORS；响应仍不能是 SVG。供应商若不支持 `n` 或相关图片字段，会返回错误，项目不猜测或改写其能力。
- `vectorize` 明确禁用并报错，不调用 `/images/edits` 冒充矢量化。

## 5. 地址、CORS、取消和错误

`baseUrl` 与路径会在 UI 保存和每次操作时校验：

- 只允许 HTTPS，或 localhost / loopback HTTP 开发地址；不允许普通 HTTP。
- URL 不得包含用户名/密码、query（`?`）或 hash（`#`）。禁止把 key 放进 URL。
- 路径必须留在配置的服务 origin 范围内，不得用跨 origin 路径、协议相对 URL 或绕过校验的编码/危险路径段。
- `baseUrl` 不自动补 `/v1`；路径拼接需按所选协议和用户填写值执行。
- 浏览器直连需要服务端 CORS：允许页面 origin，并按请求实际需要允许 `Authorization`、`Content-Type`；还必须能处理 JSON 和 multipart。对 `openai-images` 的图片 URL 下载，图片主机也必须允许 CORS。

默认超时 180 秒。用户取消返回 `REQUEST_CANCELLED`，超时返回 `REQUEST_TIMEOUT`；网络错误、HTTP 错误、JSON/图片响应不合约均返回带 `code` 的 `GraphicAPIError`。不自动重试，因为一次请求就可能计费。

## 6. 密钥与费用安全边界

浏览器直连时 key **不是服务端保密**：页面脚本、浏览器扩展和 XSS 都可能读取它。请使用低额度、短期 key，优先考虑自有后端代理，并确认供应商的额度与数据政策。绝不把 key 写进源文件、`public/`、作品数据、日志或 Git 仓库；不要在公共部署页输入长期高权限 key。

配置确认勾选表示你知道：所选供应商会收到 key（若协议发送）、提示词、源图和参考图，首次生成/编辑可能产生费用。保存本身不测试、不收费；本项目没有真实 key，也不声称已经实际推理成功。自动化测试使用 mock 验证传输，不代表供应商联通。

## 7. 保留的高级旧模式

`public/api-config.js` 的静态 `mode: 'remote'` 与旧 `api-adapter.js` 同源路径配置仍保留，适合维护者连接自有同源后端；这是**高级兼容模式**，不是页面 UI 的首选，也不应把供应商 key 写入静态文件。`mode: 'demo'` 仍是默认值。

```js
window.GRAPHIC_API_CONFIG = {
  mode: 'demo', provider: '', model: '', baseUrl: '', timeoutMs: 180000,
  endpoints: { generate: '', edit: '', vectorize: '', session: '', works: '', checkout: '', task: '' },
  options: { intelligence: [
    { id: 'fast', label: '快捷' }, { id: 'smart', label: '智能' }, { id: 'pro', label: '专家' }
  ] }
};
```

`GraphicAPI.options()` 只返回本地档位元数据；`taskQuery()` 只校验输入，不请求、不轮询，也不猜测原站任务 schema。`session`、`works`、`checkout` 和 `task` 仍为空配置预留，不实现账号、作品同步、支付或真实任务服务。

## 8. 检查命令

```bash
node scripts/check-catalog.cjs
node scripts/test-api.cjs
node scripts/test-api-settings.cjs
python3 scripts/test-api-ui.py
```

这些检查覆盖本地设置、请求传输和安全边界；没有真实 key 时不会进行真实供应商调用。
