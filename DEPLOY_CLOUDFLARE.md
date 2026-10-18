# Graphic 发布说明

## 只发布 `public/`

本次全流程演示只发布 `public/` 的 HTML、CSS、JavaScript 和图片。不要发布仓库根目录，否则可能公开文档、检查脚本或本地配置。项目**无需构建、无需 Webdev、无需环境变量或 API 密钥**。

`public/api-config.js` 默认是空 endpoint 的 `mode: demo`；前端使用本地模板和浏览器 `localStorage`。若未来接入真实服务，应先按 [API_INTEGRATION.md](./API_INTEGRATION.md) 部署并审查同源后端，不要把密钥写入静态文件。

## 先检查

在仓库根目录运行：

```bash
node scripts/check-catalog.cjs
node scripts/test-api.cjs
python3 -m http.server 8000 --directory public
```

打开 <http://localhost:8000>，确认 Logo 默认首页、素材库切换、五种工具、参考图、作品管理和账号演示正常。正式发布时确保发布根目录直接包含 `index.html`，不要嵌套一层 `public/`。

## 正式站点：Cloudflare Pages 绑定 GitHub

在 Cloudflare Pages 创建或打开项目，绑定私有仓库 `sincalaway/graphic-site`，允许平台访问该仓库。

| 配置 | 填写 |
|---|---|
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `exit 0`（若允许也可留空） |
| Build output directory | `public` |
| Root directory | 留空，保持仓库根目录 |

保存并部署。之后修改 `public/` 并提交到 `main`，若平台启用了自动部署，即可更新正式站点。参考：[静态 HTML](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)、[Git 集成](https://developers.cloudflare.com/pages/get-started/git-integration/)、[构建配置](https://developers.cloudflare.com/pages/configuration/build-configuration/)。

## 当前 API 优化版临时预览

临时预览名称固定为 `graphic-api-optimized`，仅上传 `public/`，使用以下命令（日期按发布当天填写；本次要求的日期为 `2026-10-19`）：

```bash
npx --yes wrangler@4.102.0 deploy --temporary --name graphic-api-optimized --compatibility-date 2026-10-19 --assets /绝对路径/graphic-site/public
```

建议在隔离的 HOME/XDG 目录中运行，并从该进程环境清除 Cloudflare 变量，避免使用或改变已有登录状态；这不会影响已有 Cloudflare 登录：

```bash
TMP_HOME="$(mktemp -d)"
env -i HOME="$TMP_HOME" XDG_CONFIG_HOME="$TMP_HOME/.config" PATH="$PATH" \
  npx --yes wrangler@4.102.0 deploy --temporary --name graphic-api-optimized \
  --compatibility-date 2026-10-19 --assets /绝对路径/graphic-site/public
rm -rf "$TMP_HOME"
```

如当前 shell 设有 `CLOUDFLARE_*`、`CF_*` 等账号/令牌变量，请不要传入该隔离进程；已有登录文件也不会被读取或修改。具体 CLI 可能返回公开访问 URL 和私密 claim 链接；**claim 链接只在私聊中保存和使用，生成后 60 分钟内领取，不要写入仓库、公开网页、截图或日志**。

临时部署不会更新旧 URL，不会自动绑定 Git，也不会让旧网址的 `localStorage` 同步到新地址。每次重新部署可能得到不同 URL；需要长期固定地址并跟随 GitHub 更新，请使用正式站点。临时预览也不会自动继承旧站点账号或业务服务。

## 直接上传（已有 Pages 项目）

如果要更新已有的 Cloudflare Pages 项目，可只上传 `public/` 内容；旧项目名和正式站点配置由项目维护者自行确认。临时部署命令中的 `graphic-api-optimized` 不会替换或覆盖旧 URL。

## 常见问题

**改了文件没变化？** 确认打开的是本次部署返回的 URL 并强制刷新；Git 提交不会触发临时预览自动更新。

**作品或参考图不见了？** 数据只在当前浏览器、当前站点地址的 `localStorage` 中；从旧网址换到新网址、换设备或清理站点数据都不会同步。请在换址前下载作品并重新添加参考图。

**这是 AI 或真实账号吗？** 不是。默认是本地模板演示；语义理解、真实模型、账号/微信/邮箱服务、邮件、积分、支付和云端同步均待接入。图片转 SVG 只是 SVG 中的位图容器，不是描摹。

**图标提示“图片未找到”？** 核对文件已上传、路径大小写正确；配置从 `assets/` 开始，不含 `public/` 前缀。不支持外站图片 URL 或 `../` 路径。

**分类数字比卡片少？** 数字只统计真实图标；额外空位和 `placeholder: true` 不计数。分类扩展请继续编辑 [`public/catalog.js`](./public/catalog.js)，详细步骤见 [添加分类与图标.md](./添加分类与图标.md)。

**网站是否私密？** 不是。私有仓库只限制源码访问，发布后的文件任何持有公开链接的人都可查看。不要发布敏感内容。

源码仓库：<https://github.com/sincalaway/graphic-site>（私有，需要授权）。

## 本次仓库核实

本地 `origin` 与已授权 GitHub 账号均为 `sincalaway/graphic-site`，仓库为私有，账号有 ADMIN 权限。用户已进一步确认 `sincalaway/graphic-site` 为正确仓库；最初的 `sincalwow/graphic-site` 是过期错误路径。本次仅更新已确认的现有远端，不创建或更换仓库。

REA 结论见 [公开证据摘要](docs/REA_EVIDENCE.md)。仅发布 `public/`，不得发布 REA 原始证据、分析文档、测试脚本、部署日志或 claim 链接。
