# 使用 Cloudflare Pages 部署 Graphic

这份说明面向第一次部署静态网站的用户。整个项目是普通的 HTML、CSS、JavaScript 和图片文件，**没有框架、没有构建步骤，也不需要 API key**。以下步骤只说明如何配置；不会替你登录或操作 Cloudflare。

## 1. 部署前检查

在项目目录 `/workspace/graphic-site` 中应能看到：

- 顶层 `index.html`；
- `style.css`、`app.js`；
- `assets/` 目录及其中的 `style-0.png` 到 `style-9.png`。

本地先运行一次：

```bash
cd /workspace/graphic-site
python3 -m http.server 8000
```

打开 <http://localhost:8000>，确认页面能显示风格图片，并测试生成、下载 SVG、上传图片和主题切换。停止服务器后再进行部署。

> **不要上传密钥**：此项目没有真实 AI/API key，也不需要 Cloudflare 环境变量。不要为了部署而新建 `.env` 或把密码、令牌写进前端文件。

## 2. 方案 A：连接 GitHub/GitLab（推荐）

Git 集成适合希望“提交代码后自动更新网站”的情况。Cloudflare 官方说明支持 GitHub 和 GitLab；连接后，生产分支或其他分支的提交可以触发生产部署或预览部署。

### 2.1 先把项目放进 Git 仓库

本项目仓库是 [https://github.com/sincalaway/graphic-site](https://github.com/sincalaway/graphic-site)。它当前是**私有仓库**，需要先获得 GitHub 仓库访问授权，并在 Cloudflare 授权 GitHub 时允许 Pages 访问该仓库。授权后可直接克隆；如果本地尚未关联远程仓库，也可在项目目录执行：

```bash
cd /workspace/graphic-site
git init
git add .
git commit -m "Initial static site"
git branch -M main
git remote add origin https://github.com/sincalaway/graphic-site.git
git push -u origin main
```

如果项目已经在该仓库中，只需确保 `main` 分支已推送，且仓库根目录就是本项目目录。没有仓库授权时，Cloudflare 的仓库选择器不会显示该私有仓库。

### 2.2 在 Cloudflare Pages 中创建项目

1. 登录 Cloudflare 控制台，进入 **Workers & Pages**。
2. 选择 **Create application → Pages → Connect to Git**（界面名称可能随 Cloudflare 更新略有变化）。
3. 选择 GitHub，按提示授权并允许 Pages 访问私有仓库，然后选择 `sincalaway/graphic-site`。
4. 点击 **Begin setup**，填写项目名称，并将 **Production branch** 设为 `main`。

### 2.3 填写构建设置

本项目不使用 React、Vue、Vite 等框架。Cloudflare 官方文档对无框架项目给出了两种相关写法：构建配置文档允许 **Build command 留空**；静态 HTML 部署指南则建议使用 `exit 0` 作为一个始终成功的占位命令。为减少控制台对“没有构建命令”的疑问，建议这样填写：

| Cloudflare 字段 | 填写值 | 说明 |
| --- | --- | --- |
| Framework preset | `None` / 不选择框架 | 不要选 React、Vite 等预设 |
| Production branch | `main` | 按实际生产分支填写 |
| Build command | `exit 0` | 不编译，只让构建步骤正常结束 |
| Build output directory | `.` | 当前仓库根目录，里面有顶层 `index.html` |
| Root directory | 留空 | 仓库根目录就是网站根目录 |

如果当前控制台明确允许无框架项目的 **Build command** 留空，也可以留空；关键是 **Build output directory 必须指向包含 `index.html`、`style.css`、`app.js` 和 `assets/` 的目录**。不要填写 `dist` 或 `public`，因为本项目不会自动生成这些目录。

点击 **Save and Deploy**，等待构建日志完成。完成后 Cloudflare 会提供一个类似 `项目名.pages.dev` 的地址。访问该地址时若出现 404，首先检查发布目录顶层是否有 `index.html`。

### 2.4 Git 集成之后如何更新

修改本地文件后：

```bash
git add .
git commit -m "Update static site"
git push origin main
```

Cloudflare Pages 会为新的提交重新部署生产站点。非生产分支通常会产生预览部署，适合在合并前检查。可以在 Pages 项目中查看当前部署状态、提交记录和历史部署；如不希望每次提交都部署，可在项目的构建与部署设置中调整分支自动部署规则。

> **重要选择限制**：Cloudflare 官方文档说明，Git 集成项目不能直接切换成 Dashboard 拖放式 Direct Upload；Direct Upload 项目也不能之后切换为 Git 集成。首次部署前请根据自己的更新习惯选择方案。

## 3. 方案 B：直接上传（不连接 Git）

直接上传适合偶尔发布、只想从电脑上传文件的情况。它不会因为 Git 提交自动更新；每次改文件后都要再次创建部署。

### 3.1 Dashboard 拖放上传

1. 在 Cloudflare 控制台进入 **Workers & Pages**。
2. 选择 **Create application → Get started → Drag and drop your files**。
3. 输入项目名称。
4. 新建一个发布文件夹，只复制 `index.html`、`style.css`、`app.js` 和 `assets/`，将该文件夹拖入上传区域。不要复制 `.git/`、环境文件或本地配置。也可以压缩后拖放，但压缩包内应直接包含 `index.html`，不要多包一层同名目录。
5. 选择 **Deploy site**。

之后在项目页面选择 **Create a new deployment**，为生产环境上传更新后的项目文件；也可以选择预览环境。上传的是网站文件本身，不是本地开发服务器，也不需要 `python3 -m http.server` 一起上传。

### 3.2 Wrangler 命令行（可选）

如果你愿意使用命令行，可按 Cloudflare 官方 Direct Upload 流程安装并登录 Wrangler：

```bash
cd /workspace/graphic-site # 在其他电脑上替换为实际的项目路径
mkdir -p /tmp/graphic-site-public
cp index.html style.css app.js /tmp/graphic-site-public/
cp -R assets /tmp/graphic-site-public/
npx wrangler login
npx wrangler pages project create
npx wrangler pages deploy /tmp/graphic-site-public
```

第一次 `pages project create` 会询问项目名和生产分支；后续再次发布时重新复制最新静态资源，再运行 `pages deploy`。这里使用独立的发布目录，避免上传 Git 历史或本地配置。不要把本地服务器端口或 `/workspace` 上级目录作为上传目录。

## 4. 地址与自定义域名

### 默认地址

创建 Pages 项目后，Cloudflare 会提供一个 `https://<项目名>.pages.dev` 地址。Git 集成的非生产分支还可能有对应的预览地址。这个地址可以直接分享测试。

### 绑定自己的域名

1. 进入 **Workers & Pages → 选择项目 → Custom domains**。
2. 选择 **Set up a domain**，填写要使用的域名或子域名。
3. 按页面提示完成 DNS 配置。

两种常见情况：

- **根域名**（例如 `example.com`）：通常需要把该域名作为 Cloudflare zone，并把注册商处的 nameserver 改为 Cloudflare 提供的 nameserver。
- **子域名**（例如 `design.example.com`）：可在 DNS 服务商处添加 CNAME，指向 `<项目名>.pages.dev`。但不要只手动添加 CNAME；必须先在 Pages 项目中完成 **Custom domains → Set up a domain**，否则可能出现无法解析或 522 错误。

域名 DNS 变更需要等待传播。绑定成功后，再用自定义域名打开网站并检查资源是否正常加载。

## 5. 发布后的快速检查

- 打开首页，确认没有 404，且 `assets/style-0.png` 等风格图片显示正常。
- 输入品牌名称，点击生成，确认出现本地模板作品。
- 下载一个 SVG，用文本编辑器查看可见的 `<svg>` 内容。
- 测试上传一张图片：页面提示应说明图片只在当前浏览器使用；“图片转 SVG”应明确显示为图片容器而不是矢量描摹。
- 刷新页面，确认作品仍在当前浏览器的 `localStorage` 中；换浏览器或清除站点数据后消失属于预期行为。
- 在浏览器开发者工具的 Network 面板中，可确认本项目没有调用 AI/API 服务；正常只会加载本站静态文件。

## 6. 常见问题

### 页面打开了，但没有样式或图片

通常是上传时只选了 `index.html`，或发布目录多了一层目录。请确保发布目录直接包含：

```text
index.html
style.css
app.js
assets/style-0.png
```

### 修改后页面还是旧内容

Git 集成需要确认改动已经 `git commit` 并 `git push` 到生产分支，然后在 Pages 的部署列表等待新部署完成。直接上传则必须创建新部署并重新上传文件。也可尝试强制刷新浏览器缓存。

### 为什么没有 AI 结果或登录功能

这是本项目的设计限制：生成逻辑在浏览器中使用预定义 SVG 模板；图片用 `FileReader` 本地读取；作品用 `localStorage` 保存。项目没有后端、账号、支付、积分服务或真实 API key。

## 官方文档

以下链接均为 Cloudflare 官方文档，部署字段和控制台名称如有变化，以官方页面为准：

- [Static HTML：部署无框架静态 HTML](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)
- [Git integration：连接 GitHub/GitLab](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Build configuration：构建命令与输出目录](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Direct Upload：拖放或 Wrangler 上传](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Custom domains：自定义域名](https://developers.cloudflare.com/pages/configuration/custom-domains/)
- [Branch deployment controls：分支自动部署控制](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)
