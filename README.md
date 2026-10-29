# Graphic：全流程 Logo 创作与图标素材库

Graphic 是一个**本地优先**的网站。默认进入 Logo 创作，保留原有图标素材库、参考图和作品管理功能；默认使用本地 demo，不会自动调用模型、上传数据或扣费。现在也可以从页面配置受支持的 API，包括 SenseNova 专用同源代理、ComfyUI 本机 API workflow 或高级浏览器直连：保存配置不会发请求，只有随后明确点击生成/编辑才会连接相应服务。

## 当前功能

- **素材库**：保留图标库分类切换、名称/分类/标签搜索、数量统计、预览、原图打开和预留空位。点击“素材库 / 创作”可往返切换。
- **五种工具**：`Logo`、`App Icon`、`手稿转 Logo`、`效果图 Mockup`、`图片转 SVG`。
  - **Logo**：默认本地模板演示；模板名称、主色和 Logo 名称可改。品牌概念、描述、references 会保留在 request，并显示在作品的项目说明中。
  - **App Icon**：三列手机样机预览，支持 5 种平台颜色模板。
  - **手稿转 Logo**：本地 canvas 绘图、图片上传、撤销、重做和续改，代码位于 `public/sketch-pad.js` / `public/sketch-pad.css`。
  - **效果图 Mockup**：6 个本地场景（含不套风格），支持本地排版、上传、从作品选择和样例。
  - **图片转 SVG**：明确是把位图嵌入 SVG 容器，不是矢量描摹；不会声称完成真实路径追踪。`graphic-json` 的 `vectorize` 也仍返回栅格容器，不是真正 SVG 路径实现。
- **我的作品**：按工具筛选、搜索、收藏、删除；可点开续改/预览，保存版本，修改名称，并下载 PNG 或 SVG。
- **账号界面**：微信扫码占位、邮箱登录/注册/重置密码均为前端演示；没有真实凭据校验、邮件发送、支付或账户后端。积分与服务待接入。
- **旧模块保留**：原有参考图上传/粘贴/拖放、删除、预览、压缩保存和参考取色继续可用。

## API 配置（默认仍是 demo）

顶部状态栏的 **“配置 API”**，以及“更多”菜单中的 **“API 接入状态”** 都会打开同一个配置面板。手机上按以下步骤操作：

**推荐：多服务商 · 本站代理**。打开 **配置 API**，默认即为该模式：选择服务商（SenseNova 国内/国际、火山方舟 Seedream、硅基流动、智谱 CogView、OpenAI Images），粘贴 key（多余空格、换行、引号或 `Bearer ` 前缀会自动去掉），点 **🔍 自动识别服务商** 或 **检查 key 并获取模型**（只读模型列表，不生图、不扣费），模型 ID 可从列表选择或自由填写。可选「在这台设备上记住配置」。请求经同源 `/api/image/<provider>/...` 转发到固定官方地址，详见 API_INTEGRATION.md。**部署后提示代理未部署 / key 无法使用时，先确认 Cloudflare Pages 是从仓库根部署（含 `functions/`），而不是只上传 `public/`。**

以下为旧版及高级模式说明：

1. 打开 **配置 API**，选择协议并填写协议所需字段：`graphic-json` / `openai-images` 是浏览器直连；专用 `sensenova-proxy` 仅使用同源 `/api/sensenova`，模型固定为 `sensenova-u1.5-lite`，`baseUrl` 运行时固定为 `location.origin + '/api/sensenova'`，不可改成通用代理。
2. 选择 `sensenova-proxy` 时，只在当前页面输入 SenseNova key；它仅放入当前标签页 `sessionStorage`，不读取平台保存的密钥；刷新时可读取本页会话配置。阅读安全提示并勾选确认（只有随后点击生成/编辑，key、提示词和使用的图片才会发送，可能计费）。
3. 点 **保存配置**。这一步只做本地格式校验和保存，不测试、不收费、不发请求。
   UI 将另提供 **“只读检查模型列表”** 按钮：使用当前表单中的 key 请求固定同源 `GET /api/sensenova/models`，只读取模型 ID，用于检查接口是否可访问以及是否包含 `sensenova-u1.5-lite`。这项检查不保存 key、不发图；列表可访问不证明图片生成权限或模型一定能生成。
4. 回到工具填写提示词/参考图，第一次点 **生成** 或 **编辑** 才会请求服务。失败不会默默回退 demo，也不会自动重试。
5. 不再使用时点 **清除配置**；配置会清空并回到 demo。

**ComfyUI 本机接口**：选择 `ComfyUI · 本机 API workflow`，地址填写 `http://127.0.0.1:8188`（或本机实际监听地址），再导入从 ComfyUI 导出的 **API 格式 workflow JSON**。导入与保存只在当前标签页校验和保存文件内容，不连接 ComfyUI；之后点生成才会把 workflow 原样提交并轮询历史、读取图片。项目不会猜测模型/节点，也不会把当前页面的品牌、提示词或参考图自动映射进 workflow；因此需要用户提供并导入适用于目标工作流的 API JSON。只有 workflow 内已有的提示词和节点参数会运行。此模式目前只支持生成，不支持续改或矢量化。若站点使用 HTTPS，浏览器访问本机 `http://127.0.0.1:8188` 可能被本地网络权限、混合内容或 ComfyUI 的 CORS 设置拦截；仓库提供配置框架，不保证已在所有浏览器环境连通。

配置只放在当前标签页的 `sessionStorage`：刷新通常保留，关闭标签页通常清除；浏览器的“恢复标签页”或复制标签页可能恢复或复制会话数据，因此不要把它当作密钥保险箱。key 仍能被页面脚本、浏览器扩展或 XSS 读取。建议使用低额度、短期 key，或使用自己的后端代理；绝不要把 key 写入源文件、作品、日志或仓库。

支持的协议、SenseNova 专用请求/响应、ComfyUI workflow、地址限制、CORS、错误诊断和费用边界见 **[API_INTEGRATION.md](./API_INTEGRATION.md)**。本次不读取真实 key、不调用真实生成或编辑，自动化测试只用 mock 验证配置与传输行为。错误提示不会暴露原始错误 body、URL 或 key；图像请求不会自动重试或回退。失败或超时后服务端可能仍在处理，重试前先查服务端记录。

固定同源 `GET /api/sensenova/models` 只转发到 `https://token.sensenova.cn/v1/models`，成功响应裁剪为 `{ "data": [{ "id": "..." }] }`，仅保留模型 ID；缺少或无效 `Authorization: Bearer <key>` 返回 `401`。它与生成/编辑共用同源来源、Fetch Metadata、禁止重定向、无开放 CORS 和静态错误边界。`403` 通过自身安全 `error.code` 区分来源拒绝与上游拒绝；`502`–`504` 的 `upstream_error`、`upstream_unavailable`、`invalid_upstream_response`、`upstream_timeout_or_cancelled` 等白名单码会在页面细分显示，未知码及原始正文不会展示。模型列表可访问不代表图片生成能力。

## 各模式配置详解

打开顶部 **配置 API**（或「更多 → API 接入状态」），勾选 **启用真实 API**，再在 **协议** 下拉框中选择以下四种之一。不勾选「启用真实 API」时始终是本地 demo，不发任何请求。

| 模式（协议下拉框） | 请求发往 | 需要部署代理 | 适合 |
|---|---|---|---|
| 多服务商 · 本站代理（推荐） | 同源 `/api/image/<服务商>/...`，再由代理转发到固定官方地址 | ✅ Cloudflare Pages Functions / Worker，或 EdgeOne Cloud Functions | 大多数人：SenseNova、Seedream、硅基流动、智谱、OpenAI |
| ComfyUI · 本机 API workflow | 浏览器直连本机 `http://127.0.0.1:8188` | ❌ | 本机跑 ComfyUI 的用户 |
| OpenAI 兼容 Images | 浏览器直连你填写的 API 前缀 | ❌（但服务端必须允许 CORS） | 自有或第三方 OpenAI Images 兼容服务 |
| Graphic 自有 JSON 契约 | 浏览器直连你自己的后端 | ❌（自有后端需允许 CORS） | 自建后端的开发者 |

### 1. 多服务商 · 本站代理（推荐）

| 字段 | 填什么 |
|---|---|
| 服务商 | SenseNova 国内 / SenseNova 国际版 / 火山方舟 Seedream / 硅基流动 / 智谱 CogView / OpenAI Images |
| 模型 ID | 可从「检查 key 并获取模型」返回的列表选，也可自由填写 |
| API key | 粘贴服务商控制台的 key；首尾空格、换行、引号、`Bearer ` 前缀会自动去掉 |
| 保留服务商水印 | 默认不勾选＝请求无水印图（服务商支持时生效） |
| 在这台设备上记住配置 | 勾选后存 `localStorage`，关闭标签页仍可用；共享电脑不要勾 |

各服务商要点：

| 服务商 | key 获取 | key 格式 | 单次张数 | 参考图编辑 | 建议模型 |
|---|---|---|---|---|---|
| SenseNova 国内 | <https://platform.sensenova.cn/console/keys> | `sk-` 开头 | 1（多张自动拆分） | ✅ | `sensenova-u1.5-lite` |
| SenseNova 国际版 | <https://platform.sensenova.ai/> | 国际版 key（不能与国内互用） | 1 | ✅ | `sensenova-u1.5-lite` |
| 火山方舟 Seedream | <https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey> | 通常是 UUID；模型需先在控制台开通 | 1 | ✅ | `doubao-seedream-4-0-250828`、`doubao-seedream-4-5-251128`、`doubao-seedream-5-0-260128` |
| 硅基流动 | <https://cloud.siliconflow.cn/account/ak> | `sk-` 开头 | 4 | ✅（选 Edit / Kontext 类模型） | `Kwai-Kolors/Kolors`、`Qwen/Qwen-Image`、`Qwen/Qwen-Image-Edit-2509` |
| 智谱 CogView | <https://open.bigmodel.cn/usercenter/apikeys> | `id.secret`（中间一个点） | 1 | ❌ 仅文生图 | `cogview-4-250304`、`cogview-3-flash` |
| OpenAI Images | <https://platform.openai.com/api-keys> | `sk-proj-` / `sk-` | 4 | ✅ | `gpt-image-1`、`gpt-image-1-mini` |

操作步骤：选服务商 → 粘贴 key → 点 **🔍 自动识别服务商** 或 **检查 key 并获取模型**（只读模型列表，不生图、不扣费）→ 选模型 → **保存配置** → 回到工具点 **生成 / 编辑**。

常见报错：
- **代理未部署**：`/api/image/...` 返回 404 或 HTML。只部署了 `public/`、或用 `python -m http.server` 本地预览都会这样，与 key 无关。
- **401 / 403**：key 无效、过期，或账号未开通该模型的生图权限（模型出现在列表里不等于有权限）。
- **404 / 400**：模型 ID 不存在，或尺寸、数量不被该模型接受。
- **429 / 5xx**：额度、限流或上游故障。生成请求不自动重试，避免重复扣费。

### 2. ComfyUI · 本机 API workflow

| 字段 | 填什么 |
|---|---|
| 服务地址 | `http://127.0.0.1:8188`（仅允许 localhost / 127.0.0.1 / [::1]） |
| workflow | 在 ComfyUI 里用「导出 (API)」得到的 **API 格式 JSON**，≤ 2 MiB、≤ 5,000 节点 |
| 模型 / key | 不需要，由 workflow 决定 |

点生成时页面把 workflow 原样提交到 `POST /prompt`，轮询 `/history/{id}`，再从 `/view` 取图。注意：
- 页面的品牌名、提示词、参考图**不会**自动写进 workflow，出图内容完全由 workflow 本身决定。
- 只支持生成，不支持续改、矢量化。
- 启动 ComfyUI 时需允许页面来源跨域，例如 `python main.py --enable-cors-header "*"`（或指定你的站点域名）。HTTPS 线上站访问本机 HTTP 可能被浏览器的混合内容 / 本地网络权限拦截；本地用 `python -m http.server` 打开页面最容易连通。

### 3. OpenAI 兼容 Images（非 Chat / Responses）

| 字段 | 填什么 |
|---|---|
| 服务地址 / API 前缀 | 完整前缀，需要 `/v1` 时自己写上，例如 `https://api.example.com/v1`；只允许 HTTPS 或 localhost HTTP，不能带 `?`、`#`、账号密码 |
| 模型 ID | 必填，服务商文档里的图像模型名 |
| API key | 必填，以 `Authorization: Bearer` 发送 |

无参考图时调用 `前缀/images/generations`（JSON）；有参考图或源图时调用 `前缀/images/edits`（multipart，字段 `image[]`）。返回 `data[].b64_json` 或 `data[].url` 均可。浏览器直连要求服务端允许页面来源的 CORS（含 `Authorization`、`Content-Type`），返回的图片 URL 也要允许跨域读取；不支持矢量化。

### 4. Graphic 自有 JSON 契约

| 字段 | 填什么 |
|---|---|
| 服务地址 | 你自己后端的 HTTPS 地址（本机开发可用 localhost HTTP） |
| 生成 / 编辑路径 | 默认 `/generate`、`/edit` |
| 矢量化路径 | 可选，填写后才启用 |
| 模型 ID / key | 可选；key 有值时发送 `Authorization: Bearer` |

请求为 `POST` JSON（字段 `tool`、`brand`、`concept`、`style`、`color`、`description`、`references`、`sourceImage`、`count` 等），响应为 `{ "items": [{ "id", "imageUrl", "name" }] }`，`imageUrl` 必须是可校验的栅格图（Data URL、同源路径或允许 CORS 的 HTTPS）。完整字段见 [API_INTEGRATION.md](./API_INTEGRATION.md#3-graphic-json-协议)。

## 部署指南

站点本体是纯静态文件（`public/`），任何静态托管都能打开；但 **「多服务商 · 本站代理」需要服务端函数**，只上传 `public/` 时页面能用，出图会提示「代理未部署」。

### Cloudflare Pages（推荐，代理开箱即用）

**方式 A：连接 GitHub（推荐）**

1. Cloudflare 控制台 → Workers 和 Pages → 创建 → Pages → 连接到 Git，选择本仓库。
2. 构建设置：

   | 配置 | 值 |
   |---|---|
   | 生产分支 | `main` |
   | 框架预设 | `None` |
   | 构建命令 | `exit 0` |
   | 构建输出目录 | `public` |
   | 根目录 | **留空**（保持仓库根，这样 `functions/` 才会被部署） |

3. 保存并部署。之后每次推送 `main` 自动重新部署。无需配置任何环境变量或 key，key 由用户在页面里填写。

**方式 B：Wrangler 命令行**

```bash
# 在仓库根目录执行，不要 cd public
npx wrangler login
npx wrangler pages project create          # 首次：按提示填写项目名，生产分支 main
npx wrangler pages deploy public --project-name <你的项目名> --branch main
```

输出里应看到 Functions 编译成功和部署地址。**不要**用控制台的拖拽上传，它只传静态文件、不部署 `functions/`。

**部署后验证**：打开站点 → 配置 API → 选服务商并粘贴 key → 点「检查 key 并获取模型」。能返回模型列表说明代理已生效；提示「代理未部署」就回头检查根目录是否留空。

本地完整预览（含代理）：在仓库根运行 `npx wrangler pages dev public --compatibility-date=2026-06-24`，打开 <http://localhost:8788>。更多细节见 [DEPLOY_CLOUDFLARE.md](./DEPLOY_CLOUDFLARE.md)。

### 腾讯云 EdgeOne Pages / Makers

EdgeOne Pages 已升级更名为 EdgeOne Makers，控制台和文档入口：<https://pages.edgeone.ai/zh>。仓库已带 EdgeOne 适配：`cloud-functions/`（Node.js Cloud Functions，提供与 Cloudflare 相同的 `/api/image/*`、`/api/sensenova/*` 路由）和根目录的 `edgeone.json`（输出目录 `public`、函数最长运行 120 秒）。

**方式 A：导入 Git 仓库（推荐）**

1. 登录 EdgeOne Makers 控制台 → 创建项目 → 导入 Git 仓库，授权 GitHub 并选择本仓库，生产分支 `main`。
2. 构建设置：框架预设选「Other / 无」，构建命令、安装命令留空，**输出目录 `public`**，根目录保持仓库根（表单不允许留空时填 `./`；`edgeone.json` 已写好输出目录，控制台不填也会生效）。
3. 加速区域：绑定自定义域名并选「中国大陆」或「全球（含中国大陆）」需要已备案域名；未备案选「全球（不含中国大陆）」。
4. 部署完成后，构建日志里应能看到 Cloud Functions 构建成功；之后推送 `main` 自动重新部署。无需配置环境变量，key 由用户在页面里填写。

**方式 B：命令行直接上传**

```bash
npm install -g edgeone
edgeone login                          # 选 China（国内站）或 Global（国际站）
# 在仓库根执行，CLI 会读取 edgeone.json 并一起构建 cloud-functions/
edgeone makers deploy -n <项目名>      # 项目不存在会自动创建；预览环境加 -e preview
```

不要执行 `edgeone makers deploy ./public`：只上传 `public/` 时不包含 `cloud-functions/`，代理会 404。旧命令 `edgeone pages ...` 过渡期内仍可用。本地带函数预览可在仓库根运行 `edgeone makers dev`（默认 <http://localhost:8088>）。

**部署后验证**：同 Cloudflare，打开站点 → 配置 API → 粘贴 key → 「检查 key 并获取模型」能返回列表即代理正常。

**EdgeOne 上的限制（与 Cloudflare 不同）**

| 项目 | 限制 | 影响 |
|---|---|---|
| 请求 / 响应体 | 各 6 MB | 参考图总大小建议 4 MB 以内（Base64 会膨胀约 1/3）；一次返回多张高分辨率图也可能超限，建议 EdgeOne 上每次出 1–2 张 |
| 单次运行时长 | 默认 30 秒，本仓库 `edgeone.json` 设为上限 120 秒 | 超过 120 秒的出图会被平台中断（代理自身超时为 170 秒），慢模型建议用 Cloudflare |
| Edge Functions（`edge-functions/`） | 请求体 1 MB、CPU 200 ms | 不适合本项目，所以适配用的是 Cloud Functions |

说明：`cloud-functions/_lib/public-request.mjs` 会按 `Host` / `X-Forwarded-*` 还原对外域名，避免同源检查误拒；`cloud-functions/` 只复用 `lib/` 的代理代码，Cloudflare 部署不受影响。适配已通过离线 mock 测试（`node scripts/test-edgeone-adapter.mjs`），并已在 EdgeOne 线上实测：无 key 请求 `/api/sensenova/models` 返回 401 `missing_authorization`，跨站请求返回 403 `origin_not_allowed`（符合设计；在地址栏直接打开接口地址也可能看到 403，用页面里的「检查 key」测试即可）。若出现代理 404，请反馈构建日志。

### 只上传静态文件的托管（GitHub Pages、Nginx、对象存储等）

把 `public/` 目录作为站点根即可。此时代理模式不可用，可用 demo、ComfyUI、OpenAI 兼容和自有 JSON 模式。

## 本地数据与演示边界

作品和草稿使用当前浏览器的 `localStorage`；作品最多保留 60 条。参考图仍按旧模块规则处理（PNG/JPG/WebP、单张不超过 8 MB、最多 5 张），不会上传服务器或加入图标素材库，除非你主动保存 API 配置并发起真实请求。更换网址（包括从旧网址换到新临时地址）、设备或清除站点数据时，`localStorage` 不会同步，需重新添加或下载备份。

账号只是本地演示会话，请勿输入真实密码或个人信息。默认 demo 不提供语义理解、真实 AI 生成或真实矢量描摹；API 直连是否成功取决于你填写的服务及其能力，不代表本项目提供模型或后端。

## 旧 API 模式与代码边界

仍保留 `public/api-config.js` 的旧静态**同源 `remote` 模式**，供高级用户接入自有后端；它与现在的页面配置 UI 是两条路径。旧模式中的密钥不应放进静态文件，UI 模式优先，详细区别和兼容字段见 API 文档。

`public/api-config.js`、`public/api-contract.js` 和 `public/api-adapter.js` 负责配置、契约与传输；demo 默认不发网络请求。UI 支持 `sensenova-proxy`（固定目标的专用同源模式）、`comfyui-api`（本机 API workflow 原样提交）、`graphic-json`（自有 POST JSON）与 `openai-images`（OpenAI 兼容 Images 协议，非任意供应商协议）。

原站公开资源的 REA 分析见 **[公开证据摘要](./docs/REA_EVIDENCE.md)**：可确认档位配置和客户端流程，无法确认私有服务端实现、具体模型或成功推理。智能/专家是产品档位，不是模型名；本项目的契约也不是原站后端协议。

## 以后主要改这一个文件

**[`public/catalog.js`](./public/catalog.js)** 是分类与图标配置。每个分类包含一个 `icons` 数组，新增一项就多一个图标；复制一个分类对象就多一个分类，网页会自动换行和统计数量。分类数和每类图标数不需要相同，也不设固定上限。

- 图片上传到 `public/assets/icons/<分类ID>/`，配置路径写为 `assets/icons/<分类ID>/文件名.svg`。
- `reservedSlots: 4` 表示额外显示 4 个“待添加”空位，不是容量上限；设为 `0` 即可隐藏。
- `icons: []` 可以先建立空分类，也可用 `placeholder: true` 添加有名称的占位。
- 分类及图标 ID 必须全局唯一，使用小写英文、数字与连字符。

详细复制示例、GitHub 添加步骤及常见问题见 **[添加分类与图标.md](./添加分类与图标.md)**；页面中“如何添加分类与图标”也有简短指引。

## 本地打开

无需安装依赖、构建或 Webdev。在仓库根目录运行：

```bash
# macOS / Linux
python3 -m http.server 8000 --directory public

# Windows（通常没有 python3 命令，用 python 或 py）
python -m http.server 8000 --directory public
```

8000 端口被占用时换成其他端口（如 `8080`）。这只是静态预览，`/api/...` 出图代理会返回 404；要本地测试代理，安装 Node.js 后在仓库根运行 `npx wrangler pages dev public --compatibility-date=2026-06-24`，再打开它输出的地址（默认 <http://localhost:8788>）。

打开 <http://localhost:8000>，停止服务器按 `Ctrl+C`。静态资源输出目录为 `public/`，不要公开整个仓库；使用同源模式时还必须从仓库根通过 Pages 编译并部署 `functions/`，不能仅上传静态文件。若要浏览器直连真实服务，发布站点和服务端需按文档配置 HTTPS/CORS。Cloudflare Pages Functions 的本地预览应使用 `npx wrangler pages dev public`；仅 `python3 -m http.server` 不能执行 Functions。

## 文件结构

```text
graphic-site/
├── public/                   # 静态资源与 Pages 构建输出
│   ├── index.html            # 页面结构（含 API 配置入口）
│   ├── style.css             # 原有创作样式
│   ├── catalog.css            # 素材库样式
│   ├── full-flow.js           # 五工具、作品和账号演示流程
│   ├── full-flow.css          # 全流程样式
│   ├── sketch-pad.js          # 手稿 canvas 与撤销/重做
│   ├── sketch-pad.css         # 手稿绘图样式
│   ├── api-config.js          # 旧静态配置与默认 demo
│   ├── api-contract.js        # 自有输入/响应与任务查询校验
│   ├── api-settings.js        # sessionStorage 配置与校验
│   ├── api-settings-ui.js     # 个人 API 配置面板
│   ├── api-adapter.js         # API 传输、超时、取消和错误归一化
│   ├── app.js                 # 原有本地模板生成器
│   ├── references.js          # 原有参考图模块
│   ├── catalog.js             # 分类和图标配置
│   ├── catalog-ui.js          # 素材库渲染、搜索和筛选
│   └── assets/                # 示例图标资源
├── lib/sensenova-proxy.mjs    # 受限转发与白名单校验
├── functions/                # Cloudflare Pages Functions（仓库根目录，部署时不放入 public/）
├── cloud-functions/          # EdgeOne Makers Cloud Functions 适配（同样的 /api 路由）
├── edgeone.json              # EdgeOne 输出目录与函数运行时长配置
├── lib/image-proxy.mjs        # 多服务商出图代理（Cloudflare 与 EdgeOne 共用）
├── scripts/check-catalog.cjs  # 配置、路径和资源检查
├── scripts/test-api-settings.cjs # API 配置设置测试
├── scripts/test-api-errors.cjs # API 错误归一化测试
├── scripts/test-api-ui.py     # API UI/传输自动化测试
├── scripts/test-api-errors-ui.py # API 错误提示 UI 测试
├── 添加分类与图标.md           # 分类扩展教程
├── API_INTEGRATION.md          # API 请求/响应契约
├── DEPLOY_CLOUDFLARE.md       # 发布说明
└── README.md
```

## 检查与发布

```bash
node scripts/check-catalog.cjs
node scripts/test-api.cjs
node scripts/test-api-settings.cjs
node scripts/test-api-errors.cjs
node scripts/test-sensenova-proxy.cjs
# 以下浏览器测试需先启动静态服务器（默认 4206 端口）
python3 scripts/test-sensenova-ui.py
python3 scripts/test-api-ui.py
python3 scripts/test-api-errors-ui.py
# 另开终端运行静态服务器后，可选执行完整浏览器回归：
# python3 -m http.server 4206 --directory public
# python3 scripts/test-flow.py  # 需要 Playwright + Chromium
```

上述 API 自动化测试验证配置、请求传输与错误边界，不代表使用真实供应商完成推理。通过检查后，按 [部署说明](./DEPLOY_CLOUDFLARE.md) 发布。GitHub 提交不等于临时预览自动更新。

## 隐私与仓库

此仓库为公开仓库，源代码和发布后的站点文件都可被公众查看。部署到 Pages 时只把 `public/` 作为静态输出目录，不要把仓库根目录当作站点资源目录；不要提交密钥、个人信息或无权公开的素材。源码仓库：<https://github.com/sincalaway/graphic-site>。部署状态以实际发布环境为准；发布或更新网站请按 [部署说明](./DEPLOY_CLOUDFLARE.md) 操作。

诊断离线回归：`node scripts/test-sensenova-models.cjs`；启动静态服务器后运行 `GRAPHIC_TEST_URL=http://127.0.0.1:4210/ python3 scripts/test-sensenova-diagnostics.py`。全部使用 mock，不读取真实 key 或连接供应商。

本站同源代理请求使用 `credentials: same-origin`，让 Cloudflare 安全验证 cookie 能随本站请求发送；高级跨域直连仍使用 `omit`。Worker 仅显式转发 Authorization/Accept（图像请求另含必要 Content-Type），不向 SenseNova 转发浏览器 cookie。若 403 标记 `cf-mitigated: challenge` 或返回 HTML，UI 显示「本站前置安全验证」，不把它误判为上游拒绝，不显示原始正文。
