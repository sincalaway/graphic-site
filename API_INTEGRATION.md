# Graphic API 集成说明

本文档描述 Graphic 新增的 **SenseNova 专用同源代理**、保留的浏览器直连配置，以及高级静态同源模式。它们都是本项目自己的适配边界，不是原站后端文档；原站公开资料不证明其具体供应商、模型或私有接口；这里的 SenseNova 集成是本项目的独立实现。

## SenseNova 专用同源模式（`protocol='sensenova-proxy'`）

### 安全边界与固定路由

- 前端 `baseUrl` 运行时固定为 `location.origin + '/api/sensenova'`，请求只发到同源 Pages Function。
- Function 仅转发至固定上游 `https://token.sensenova.cn/v1` 的两条路径：`/images/generations` 与 `/images/edits`；这不是可配置的通用代理。
- key **只取用户当前页面输入**，保存在当前标签页 `sessionStorage`；不读取平台保存的 secret；刷新时可读取本页面输入并保存在 sessionStorage 的配置，不把 key 写入源码、URL、作品、服务器环境变量、日志或响应回显。
- `Authorization: Bearer <key>` 透传到上游；不能把 key 放 query、路径或 JSON 字段。无服务器端 SenseNova secret 或 environment binding 需要。
- 上游错误只允许向浏览器返回静态 `code` / `status` 分类；不得转发、记录或回显上游错误正文、key、请求体或完整 URL。
- 禁止重定向，不自动重试。取消或超时只表示浏览器停止等待；上游可能仍在处理并计费。

前端模式和受限 Function 已在仓库中实现；本次仅通过 mock / 离线测试验证，不发起真实生成或编辑，也不部署。此前单独生成测试成功不代表编辑、批量或其他参数已由供应商验证。

### 来源、大小、超时和日志

函数拒绝跨源 Origin 和跨站 / same-site Fetch Metadata，不发送开放 CORS 响应头。无 Origin 的非浏览器客户端可调用，但仍须提供自己的 Bearer key；来源校验不是用户鉴权，也不是限流。函数没有内置账号、WAF 或速率限制，公开部署建议由维护者配置平台访问/用量保护。仅允许 `model`、`prompt`、`n` 及编辑的 `image[]`；提示词最多 100,000 字符；重复 multipart 字段及未知字段拒绝。函数使用 120 秒上游超时，浏览器等待上限仍为 180 秒；取消尽力传递，不保证供应商撤销任务。

应用代码没有 console 请求日志或存储绑定，不持久化请求/响应。维护者不要额外启用包含 Authorization 或正文的日志、抓包、Analytics 或中间件；平台和供应商自己的运行/计费元数据不由本项目控制。

### 生成：JSON

无参考图/源图时，前端向同源 Function 发：

```http
POST /api/sensenova/images/generations
Content-Type: application/json
Authorization: Bearer <当前页面输入的 key>
```

请求体为 SenseNova Images 生成所需 JSON，模型字段固定且不可由用户改写：

```json
{
  "model": "sensenova-u1.5-lite",
  "prompt": "几何、友好的环保品牌标志",
  "n": 1
}
```

项目映射的提示词/图片字段应以实际实现和上游契约为准；不要把本专用模式当成任意 OpenAI 供应商兼容层。

### 编辑：multipart `image[]`

有源图或参考图时，前端向同源 Function 发：

```http
POST /api/sensenova/images/edits
Content-Type: multipart/form-data; boundary=（由浏览器自动生成）
Authorization: Bearer <当前页面输入的 key>
```

图片字段名固定为 `image[]`，不要手工覆盖 multipart boundary。本项目单次请求限制为 `n=1..4`，这不是供应商批量能力承诺。请求限制为：单图不超过 **8 MiB**，单次最多 **6** 张，媒体类型仅 PNG/JPEG/WebP，整个请求不超过 **20 MiB**。Function 对实际读取的请求字节执行限制并验证字段；前端也会在超过张数范围时本地拒绝，不能据此声称上游已验证接受。

### 返回与失败

Function 最多读取 20 MiB 上游响应，只保留 `data[].b64_json` 或安全 HTTPS `data[].url`；前端只消费经过项目契约校验的栅格结果；接受经过白名单过滤的 Images `data` 结果；外链结果仍需图片主机允许浏览器 CORS，Function 不代取任意图片 URL。Function 对上游失败只返回静态分类，例如 HTTP 401 与 `{ "error": { "code": "upstream_error" } }`；status 由 HTTP 状态表示，不返回原始 body。页面错误展示也不得暴露 key、URL 或原始错误正文。

失败、取消、超时或图片下载失败时，上游可能已完成并计费；不要立即盲目重试，先查服务端请求/账单记录。没有 key 时本项目不会进行真实调用。

### 明确不支持

`sensenova-proxy` 不支持 `vectorize`，不把矢量化伪装成生成或编辑；不支持任意上游路径、任意模型、任意 provider、重定向、重试、服务端保存 key、服务端日志、响应回显或服务器端 SenseNova secret binding。


## 1. 浏览器直连模式：默认状态与 UI 入口

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

## 6. 通用失败提示与排查

页面可通过 `GraphicAPI.errorInfo(e)` 将异常整理为安全的静态信息：

```js
{ title, message, hint, code, status }
```

其中 `title`、`message`、`hint`、`code` 都是安全静态文字，`status` 仅为 HTTP 整数或 `null`。兼容代码仍包括 `NETWORK_ERROR` 和 `HTTP_ERROR`；HTTP 细分使用 `e.details.status`（不从错误正文猜测），并在 `errorInfo` 结果中以 `status` 提供。还可能出现 `REQUEST_CANCELLED`、`REQUEST_TIMEOUT`、`INVALID_RESPONSE` 和 `IMAGE_FETCH_FAILED`。网络失败无法由浏览器可靠区分 CORS、DNS、TLS、离线或重定向，因此不要据提示断定具体根因。

| 代码/状态 | 常见含义与先查事项 |
|---|---|
| `400` / `422` | 参数、字段、图片格式或模型能力不符合服务要求；核对请求契约、必填参数、`n`、`image[]` 和该模型支持的能力。不要猜测某个服务商的模型根因。 |
| `401` / `403` | key 无效、认证方式不对、账号无权使用模型或来源未获允许；检查 key、权限、额度策略和 CORS。 |
| `404` / `405` | 端点、路径、HTTP 方法或模型路由不对；确认 `baseUrl` 是 API 前缀而非完整 endpoint，并确认使用 `/images/generations` 或 `/images/edits`。 |
| `408` / `504` | 客户端或网关超时；检查服务端记录和任务状态。 |
| `413` | 图片或请求体过大；缩小图片或减少参考图。 |
| `415` | Content-Type、multipart 协议或图片媒体类型不受支持；不要手工覆盖 multipart boundary。 |
| `429` | 限流、并发限制或额度不足；检查服务商限额和账单。 |
| `5xx` | 服务端或上游暂时失败；查看服务状态与服务端记录。 |
| `NETWORK_ERROR` | 浏览器没有拿到可读取的网络响应；可能与 CORS、DNS、TLS、离线或重定向有关，但本项目不能区分。 |
| `INVALID_RESPONSE` | HTTP 成功但 JSON 结构、`data`/`items` 或图片结果不符合契约。 |
| `IMAGE_FETCH_FAILED` | `data[].url` 图片无法按 CORS/HTTPS 规则下载或无法转为受支持的栅格图。 |

错误信息不会记录或暴露原始错误 body、请求 URL 或 key；不会自动重试，也不会自动回退到其他模型、端点或 demo。失败、超时和图片下载失败时，服务端可能已经完成生成并产生费用；手动重试前先查询服务端请求/任务记录和账单，避免重复提交。

对于 `openai-images`，`baseUrl` 只填写 API 前缀（例如已包含 `/v1`），不要写完整 endpoint。该适配器只使用非 Chat/Responses/任务协议的 Images 路径：无源图时 `baseUrl + /images/generations`，有源图或参考图时 `baseUrl + /images/edits`；后者使用 multipart 的 `image[]`。请求中的 `n` 和图片字段必须由目标服务实际支持，项目不会据此推断或改写具体供应商模型能力。

配置面板会随地址和路径输入显示最终 `POST` 路径；这是本地拼接预览，不是连通性或模型能力验证，不会请求服务。错误面板可直接打开“检查 API 配置”；“再次发送（可能计费）”只有主动点击才会重发。续改也使用相同的安全错误分类，不显示服务端原始正文。

## 7. 密钥与费用安全边界

浏览器直连时 key **不是服务端保密**：页面脚本、浏览器扩展和 XSS 都可能读取它。请使用低额度、短期 key，优先考虑自有后端代理，并确认供应商的额度与数据政策。绝不把 key 写进源文件、`public/`、作品数据、日志或 Git 仓库；不要在公共部署页输入长期高权限 key。

配置确认勾选表示你知道：所选供应商会收到 key（若协议发送）、提示词、源图和参考图，首次生成/编辑可能产生费用。保存本身不测试、不收费；本次不读取或使用已保存的真实 key，也不进行真实调用。自动化测试使用 mock 验证传输，不代表供应商联通。

## 8. 保留的高级旧模式

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

## 9. 检查命令

```bash
node scripts/check-catalog.cjs
node scripts/test-api.cjs
node scripts/test-api-settings.cjs
node scripts/test-api-errors.cjs
node scripts/test-sensenova-proxy.cjs
python3 scripts/test-sensenova-ui.py
python3 scripts/test-api-ui.py
python3 scripts/test-api-errors-ui.py
```

这些检查覆盖本地设置、请求传输和安全边界；没有真实 key 时不会进行真实供应商调用。
