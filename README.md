<h1 align="center">EdgeShield</h1>

<p align="center">Cloudflare Snippets + Workers 轻量边缘 WAF</p>

<p align="center">
  <a href="https://workers.cloudflare.com/"><img src="https://img.shields.io/badge/Cloudflare-Workers%20%2B%20Snippets-F38020?logo=cloudflare&logoColor=white" alt="Cloudflare Workers and Snippets" /></a>
  <img src="https://img.shields.io/badge/version-v0.1%20MVP-2563eb" alt="v0.1 MVP" />
</p>

EdgeShield 用 Snippet 接管入口流量，用 Worker 做 `allow / challenge / block` 决策。当前是 MVP，适合小范围试点。

## 部署

在 Cloudflare Workers & Pages 里选择 `Continue with GitHub`，选中本仓库。

| 项目 | 填写 |
| --- | --- |
| Build command | `npm run check` |
| Deploy command | `npm run deploy` |

然后在“为运行时使用的 Worker 定义环境变量和机密”里添加：

| 变量 | 示例 | 说明 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | `***` | 用于安装 Snippet |
| `PROTECTED_HOSTNAME` | `www.example.com` | 要保护的域名 |
| `PROTECTED_PATH_PREFIX` | `/login` | 可选，只保护某个路径前缀 |
| `CLOUDFLARE_ZONE_ID` | `abcdef...` | 可选；不想自动匹配 Zone 时填写 |

`CLOUDFLARE_API_TOKEN` 权限：

| 范围 | 权限 |
| --- | --- |
| Zone | `Snippets:Edit` |
| Zone | `Zone:Read` |

部署完成后打开 Worker 地址：

```text
https://你的-worker.workers.dev/
```

未安装时会显示安装页。输入 `CLOUDFLARE_API_TOKEN` 后点击安装；安装完成后自动进入工作台，之后刷新不再显示安装页。

## 工作台

工作台显示：

- Snippet 是否已安装
- API Token 是否已配置
- 保护域名
- KV 黑名单绑定状态
- Worker 决策接口

如果需要重新安装或更新 Snippet，可打开折叠的诊断信息，复制安装接口；也可以直接请求：

```bash
curl -X POST "https://你的-worker.workers.dev/__edge-waf/install" \
  -H "x-api-token: 你的 CLOUDFLARE_API_TOKEN"
```

## 规则

默认保护表达式由 `PROTECTED_HOSTNAME` 自动生成：

```text
(http.host eq "www.example.com")
```

如果设置了 `PROTECTED_PATH_PREFIX=/login`，会生成：

```text
(http.host eq "www.example.com" and starts_with(http.request.uri.path, "/login"))
```

也可以直接设置 `SNIPPET_EXPRESSION` 覆盖自动规则。

## 判定

```text
score = 0
if ua missing or too short  +40
if path contains /login     +10
if KV bad:<ip> exists       +60
```

| 分数 | 动作 |
| --- | --- |
| `0-39` | `allow` |
| `40-79` | `challenge` |
| `80+` | `block` |

KV 黑名单格式：

```text
bad:<ip> = 1
```

未绑定 KV 时，黑名单规则会自动跳过。

## 本地

```bash
npm install
npm run dev
```

CLI 部署：

```bash
npm run deploy
```

构建期一键部署仍保留：

```bash
npm run deploy:all
```

## 文件

| 路径 | 作用 |
| --- | --- |
| `worker/index.js` | Worker 入口 |
| `worker/dashboard.js` | Web 工作台 |
| `worker/installer.js` | Snippet 安装 |
| `worker/scoring.js` | 规则打分 |
| `snippets/edge-gate.js` | Snippet 模板 |
| `scripts/deploy-cloudflare.mjs` | 构建期一键部署 |
