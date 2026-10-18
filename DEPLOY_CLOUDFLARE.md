# Graphic 发布说明

## 只发布 public

网站需要的 HTML、CSS、JavaScript 和图片都在 `public/`。不要发布仓库根目录，否则可能公开说明文档、工具文件或本地配置。

旧版页面文件位于根目录；本次已移入 `public/`，原有托管服务需要修改输出目录。网站无需构建、环境变量或 API 密钥。

## 先检查

在仓库根目录运行：

```bash
node scripts/check-catalog.cjs
python3 -m http.server 8000 --directory public
```

打开 <http://localhost:8000>，确认分类、图片、预留空位、搜索、预览及创作功能正常。

## 正式站点：Cloudflare Pages 绑定 GitHub

在 Cloudflare Pages 创建或打开项目，绑定私有仓库 `sincalaway/graphic-site`，允许平台访问该仓库。

| 配置 | 填写 |
|---|---|
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `exit 0`（若允许也可留空） |
| Build output directory | `public` |
| Root directory | 留空，保持仓库根目录 |

保存并部署。之后修改 `public/catalog.js`、上传图片并提交到 `main`，若平台启用了自动部署，即可自动更新这个正式站点。当前临时预览并未因此自动绑定到 GitHub。

参考：[静态 HTML](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)、[Git 集成](https://developers.cloudflare.com/pages/get-started/git-integration/)、[构建配置](https://developers.cloudflare.com/pages/configuration/build-configuration/)。

## 直接上传

在 Cloudflare Pages 直接上传时，上传 `public/` 的内容，确保发布顶层直接是 `index.html`，不要再嵌套一层 `public/`。

若你自己已登录 Cloudflare CLI，可运行以下命令发布到已有的 Pages 项目：

```bash
npx --yes wrangler@4.102.0 pages deploy public --project-name 你的项目名
```

直接上传不会自动跟随 GitHub 更新，每次修改后需再次发布。参考：[直接上传](https://developers.cloudflare.com/pages/get-started/direct-upload/)。

## 当前使用的临时预览

本次预览使用隔离、未登录的临时部署环境，仅上传 `public/`：

```bash
npx --yes wrangler@4.102.0 deploy --temporary --name graphic-wow --compatibility-date 2026-10-18 --assets /绝对路径/graphic-site/public
```

日期参数应使用发布当天的日期。临时发布应使用全新的临时 HOME/XDG 配置目录，并从该进程环境中移除 Cloudflare 令牌和账号变量，避免使用或改变已有登录状态。

部署工具会提供公开访问 URL 和私密认领链接；**认领链接仅通过私聊保存和使用，领取窗口为生成后 60 分钟**。不要把它、任何凭据或部署日志提交到 Git、公开网页或截图中。具体预览保留时间以工具当次返回为准，不要把认领窗口误当成站点寿命。

重新运行临时部署可能得到不同 URL，不会自动覆盖之前另一个临时环境的网址。若要长期固定地址并跟随 GitHub 更新，应使用自己的正式站点。

## 常见问题

**改了配置没变化？** Git 提交不一定触发当前站点发布。确认已部署到你打开的网址，再强制刷新。图片也可换文件名以避开旧缓存。

**图标提示“图片未找到”？** 核对文件已上传、路径大小写正确；配置从 `assets/` 开始，不含 `public/` 前缀。不支持外站图片 URL 或 `../` 路径。

**分类数字比卡片少？** 数字只统计真实图标；额外空位和 `placeholder: true` 不计数。

**配置错误提示？** 运行检查脚本，修正重复 ID、错误路径、漏逗号或其他语法问题后再部署。

**网站是否私密？** 不是。私有仓库只限制源码访问，发布后的文件任何持有公开链接的人都可查看。不要发布敏感内容。
