<h1 align="center">EdgeShield</h1>

<p align="center">Cloudflare Snippets + Workers 边缘 WAF</p>

<p align="center">
  <a href="https://workers.cloudflare.com/"><img src="https://img.shields.io/badge/Cloudflare-Workers%20%2B%20Snippets-F38020?logo=cloudflare&logoColor=white" alt="Cloudflare Workers and Snippets" /></a>
  <img src="https://img.shields.io/badge/version-v0.1-2563eb" alt="v0.1" />
</p>

EdgeShield 用 Snippet 接管入口流量，用 Worker 返回 `allow / challenge / block` 决策。

## 部署

打开 [Cloudflare Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages)，选择 `Continue with GitHub`，选中本仓库。

| 配置项 | 填写 |
| --- | --- |
| Build command | `npm run check` |
| Deploy command | `npm run deploy` |

部署时选择“为运行时使用的 Worker 定义环境变量和机密”，不要填到构建变量里。
`npm run deploy` 会自动查找 D1 数据库 `edge_waf_db`，生成 `DB` Binding，并保留面板里的运行时变量和密钥。

## 变量

| 变量 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | 是 | `***` | 安装 Snippet |
| `PROTECTED_HOSTNAME` | 否 | `www.example.com` | 可在引导页保存到 D1 |
| `PROTECTED_PATH_PREFIX` | 否 | `/login` | 可在引导页保存到 D1 |
| `CLOUDFLARE_ZONE_ID` | 否 | `abcdef...` | 不想自动匹配 Zone 时填写 |
| `CLOUDFLARE_ZONE_NAME` | 否 | `example.com` | 用 Zone 名称匹配 |
| `SNIPPET_EXPRESSION` | 否 | `(http.host eq "www.example.com")` | 覆盖自动规则 |

`CLOUDFLARE_ZONE_ID` 通常不用填。只要 `CLOUDFLARE_API_TOKEN` 有 `Zone:Read`，Worker 会按保护域名自动匹配 Zone。

绑定：

| 绑定 | 必填 | 作用 |
| --- | --- | --- |
| `DB` | 是 | D1，数据库名建议 `edge_waf_db` |
| `KV` | 否 | 黑名单，格式 `bad:<ip> = 1` |

如果重新部署后 D1 检测不过，先确认 D1 数据库名是 `edge_waf_db`，Binding 变量名是 `DB`。

Token 权限：

| 范围 | 权限 |
| --- | --- |
| Zone | `Snippets:Edit` |
| Zone | `Zone:Read` |

最佳实践：

- 配在 `Production` 的运行时变量和密钥里，Preview 环境要单独配置。
- `CLOUDFLARE_API_TOKEN` 用密钥，不要写进代码、D1 或 `wrangler.toml`。
- Snippet 规则、管理员账号和会话保存到 D1；安装时读取 D1 的最新规则。
- D1/KV 绑定是部署配置，不能由正在运行的 Worker 直接附加到自身。
- Git 部署用 `npm run deploy`；`npm run deploy:all` 适合本地 CLI 一次性部署。
- 改完 Cloudflare 变量后，重新部署一次或等待当前环境刷新，再打开首页检测。

## 安装

打开 Worker 首页：

```text
<Worker 地址>/
```

未安装时会进入安装页：

1. 检测
2. 规则
3. 账号
4. 安装

安装成功后自动进入工作台。之后刷新首页会先显示登录页。

如果安装时提示 `CLOUDFLARE_API_TOKEN is not configured`，打开 [Cloudflare Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages)，进入当前 Worker，在 `Settings -> Variables and Secrets` 的运行时变量和密钥里添加 `CLOUDFLARE_API_TOKEN`，然后重新部署或等待环境刷新。

## 工作台

工作台显示：

- Snippet 状态
- 保护范围
- D1 规则库状态
- Zone 匹配结果
- KV 黑名单状态
- 决策接口、状态接口、安装接口

登录后可以修改 D1 规则。修改后在工作台重新安装 Snippet 生效。

## 规则

默认表达式：

```text
(http.host eq "www.example.com")
```

带路径前缀：

```text
(http.host eq "www.example.com" and starts_with(http.request.uri.path, "/login"))
```

判定分数：

| 条件 | 分数 |
| --- | --- |
| UA 缺失或过短 | `+40` |
| 路径包含 `/login` | `+10` |
| KV 存在 `bad:<ip>` | `+60` |

| 分数 | 动作 |
| --- | --- |
| `0-39` | `allow` |
| `40-79` | `challenge` |
| `80+` | `block` |

KV 黑名单格式：

```text
bad:<ip> = 1
```

未绑定 KV 时，黑名单规则会跳过。

## 本地

```bash
npm install
npm run dev
```

检查：

```bash
npm run check
```

CLI 部署：

```bash
npm run deploy
```

构建期一键部署：

```bash
npm run deploy:all
```
