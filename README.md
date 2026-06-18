<p align="center">
  <h1 align="center">EdgeShield</h1>
</p>

<p align="center">
  基于 Cloudflare Snippets + Workers 的轻量边缘 WAF MVP
</p>

<p align="center">
  <a href="https://workers.cloudflare.com/"><img src="https://img.shields.io/badge/Powered%20by-Cloudflare-F38020?logo=cloudflare&logoColor=white" alt="Powered by Cloudflare" /></a>
  <img src="https://img.shields.io/badge/status-v0.1%20MVP-2563eb" alt="v0.1 MVP" />
  <img src="https://img.shields.io/badge/runtime-Workers%20%2B%20Snippets-111827" alt="Workers and Snippets" />
</p>

EdgeShield 用 Cloudflare Snippet 做请求入口网关，用 Worker 做集中决策引擎。它可以在边缘对请求返回 `allow`、`challenge` 或 `block`，并用 KV 保存最小 IP 黑名单。

> 当前是 v0.1 MVP。挑战 token 仍是演示级实现，不应直接当作高强度反机器人方案。

## 快速部署

推荐使用 Cloudflare 控制台的 GitHub 集成部署，流程和 NodeWarden 类似：把仓库交给 Cloudflare 构建，再由 `npm run deploy:all` 完成 Worker、KV、Snippet 和 Snippet Rule 的部署。

### 1. Cloudflare 控制台部署

1. 打开 [Cloudflare Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create)。
2. 选择 `Continue with GitHub`，授权并选择 `EdgeShield` 仓库。
3. 构建命令填写：

```bash
npm run check
```

4. 部署命令填写：

```bash
npm run deploy:all
```

5. 在 Cloudflare 的构建变量或 Secret 中添加下面的必要变量。

## 必要变量

这几个变量必须配置，否则部署无法创建 KV、发布 Worker 或把 Snippet 挂到 Zone。

| 变量 | 必填 | 示例 | 用途 | 获取位置 |
| --- | --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | 是 | `***` | 调用 Cloudflare API 部署 Worker、KV、Snippet | Cloudflare Dashboard -> My Profile -> API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | 是 | `0123456789abcdef0123456789abcdef` | 指定部署到哪个 Cloudflare Account | Dashboard 右侧栏或 Account home |
| `CLOUDFLARE_ZONE_ID` | 是 | `abcdef0123456789abcdef0123456789` | 指定 Snippet Rule 挂到哪个 Zone | 进入站点后右侧栏 `Zone ID` |

如果不方便填 `CLOUDFLARE_ZONE_ID`，可以改填：

| 变量 | 示例 | 说明 |
| --- | --- | --- |
| `CLOUDFLARE_ZONE_NAME` | `example.com` | 脚本会用域名自动查询 Zone ID，但 token 需要额外的 `Zone:Read` 权限。 |

最小可用配置通常是：

```text
CLOUDFLARE_API_TOKEN=你的 Cloudflare API Token
CLOUDFLARE_ACCOUNT_ID=你的 Account ID
CLOUDFLARE_ZONE_ID=你的 Zone ID
SNIPPET_EXPRESSION=(http.host eq "www.example.com")
```

> 不建议第一次部署使用默认 `SNIPPET_EXPRESSION=true`，它会让 Snippet 在整个 Zone 生效。生产环境建议先限定到一个测试域名或路径。

## API Token 权限

创建 Cloudflare API Token 时，至少给这些权限：

| 范围 | 权限 | 用途 |
| --- | --- | --- |
| Account | `Workers Scripts:Edit` | 发布 Worker |
| Account | `Workers KV Storage:Edit` | 创建或复用 KV namespace |
| Account | `Account Settings:Read` | Wrangler 读取账号信息 |
| Zone | `Snippets:Edit` | 创建 Snippet 和 Snippet Rule |
| Zone | `Zone:Read` | 仅在使用 `CLOUDFLARE_ZONE_NAME` 自动解析 Zone ID 时需要 |

Token 的资源范围建议限制到当前 Account 和目标 Zone。

## 可选变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `WORKER_NAME` | `edge-waf-v0-1` | Cloudflare Worker 名称 |
| `KV_NAMESPACE` | `edge-waf-v0-kv` | KV namespace 名称，不存在时自动创建 |
| `SNIPPET_NAME` | `edge_waf_gate` | Cloudflare Snippet 名称，只能使用小写字母、数字和下划线 |
| `SNIPPET_EXPRESSION` | `true` | Snippet Rule 表达式，决定哪些请求进入 WAF |

常用 `SNIPPET_EXPRESSION` 示例：

```text
# 只保护一个域名
(http.host eq "www.example.com")

# 只保护登录路径
(http.host eq "www.example.com" and starts_with(http.request.uri.path, "/login"))

# 排除静态资源路径后保护整站
(http.host eq "www.example.com" and not starts_with(http.request.uri.path, "/assets/"))
```

## 本地 CLI 部署

```bash
git clone https://github.com/liut-coder/EdgeShield.git
cd EdgeShield
npm install
```

设置环境变量后执行：

```bash
npm run deploy:all
```

`deploy:all` 会执行完整部署：

1. 校验必要变量。
2. 创建或复用 KV namespace。
3. 生成 `wrangler.generated.toml`，写入真实 KV id。
4. 部署 Worker。
5. 用真实 Worker decision URL 渲染 Snippet。
6. 创建或更新 Cloudflare Snippet。
7. 创建或更新 Snippet Rule。

## GitHub Actions 部署

仓库也提供手动触发的 GitHub Actions workflow：

```text
.github/workflows/deploy-cloudflare.yml
```

在 GitHub 仓库中进入 `Settings -> Secrets and variables -> Actions`，添加：

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_ZONE_ID
```

然后进入 `Actions -> Deploy to Cloudflare -> Run workflow`。workflow inputs 可以覆盖 Worker、KV、Snippet 名称和 Snippet 表达式。

## 常见错误

### `Error: CLOUDFLARE_ZONE_ID is required`

Cloudflare 构建环境没有自动注入 Zone ID。处理方式：

1. 到 Cloudflare 目标站点页面右侧复制 `Zone ID`。
2. 在 Workers & Pages 项目的变量或 Secret 中添加 `CLOUDFLARE_ZONE_ID`。
3. 重新部署。

也可以设置 `CLOUDFLARE_ZONE_NAME=example.com`，但 token 需要 `Zone:Read` 权限。

### Snippet 部署成功但全站都被保护

检查 `SNIPPET_EXPRESSION`。默认值 `true` 表示整个 Zone 都会执行 Snippet。建议改成：

```text
(http.host eq "www.example.com")
```

### GitHub push workflow 文件失败

如果 GitHub 拒绝 push `.github/workflows/deploy-cloudflare.yml`，说明当前 PAT 缺少 `workflow` scope。给 PAT 增加 `workflow` 权限后重试。

## 架构

```text
Client
  |
  v
Cloudflare Snippet (Edge Gateway)
  |
  v
Cloudflare Worker (Decision Engine)
  |
  +-- allow -----> Origin
  |
  +-- challenge -> HTML challenge page -> inline JS -> __token cookie -> reload -> Origin
  |
  +-- block -----> 403
```

## 核心模块

| 路径 | 作用 |
| --- | --- |
| `snippets/edge-gate.js` | Snippet 入口网关，旁路静态资源，把 IP、UA、路径和 Cookie 发给 Worker 决策 |
| `worker/index.js` | Worker 决策入口，返回 `allow`、`challenge` 或 `block` |
| `worker/scoring.js` | MVP 规则打分 |
| `worker/challenge.js` | 生成挑战页和内联检查脚本 |
| `worker/utils.js` | 输入解析、JSON 响应、Cookie 和 token 工具 |
| `scripts/deploy-cloudflare.mjs` | 完整部署编排 |
| `scripts/deploy-snippet.mjs` | Snippet API 上传和 Snippet Rule 更新 |
| `kv/schema.md` | KV key 约定 |

## 打分规则

```text
score = 0
if ua missing or too short  +40
if path contains /login     +10
if KV bad:<ip> exists       +60
```

| Score | Action |
| --- | --- |
| `0-39` | `allow` |
| `40-79` | `challenge` |
| `80+` | `block` |

KV 黑名单格式：

```text
bad:<ip> = 1
```

## 当前范围

已实现：

- Cloudflare Snippet 请求入口过滤
- Worker 决策核心
- IP / UA / path 规则打分
- JS challenge 和 MVP cookie token
- KV bad IP 查询
- Cloudflare 控制台、CLI、GitHub Actions 三种部署入口

后续预留：

- rate limiting
- 服务端签名 trust token
- bot scoring API
- 更完整的测试覆盖
