<h1 align="center">EdgeShield</h1>

<p align="center">Cloudflare Snippets + Workers 边缘 WAF</p>

<p align="center">
  <a href="https://workers.cloudflare.com/"><img src="https://img.shields.io/badge/Cloudflare-Workers%20%2B%20Snippets-F38020?logo=cloudflare&logoColor=white" alt="Cloudflare Workers and Snippets" /></a>
  <img src="https://img.shields.io/badge/version-v0.1-2563eb" alt="v0.1" />
</p>

EdgeShield 用 Snippet 接管入口流量，用 Worker 返回 `allow / challenge / block` 决策。

## 部署

在 Cloudflare Workers & Pages 里选择 `Continue with GitHub`，选中本仓库。

| 配置项 | 填写 |
| --- | --- |
| Build command | `npm run check` |
| Deploy command | `npm run deploy` |

部署时选择“为运行时使用的 Worker 定义环境变量和机密”，不要填到构建变量里。

## 变量

| 变量 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | 是 | `***` | 安装 Snippet |
| `PROTECTED_HOSTNAME` | 是 | `www.example.com` | 要保护的域名 |
| `PROTECTED_PATH_PREFIX` | 否 | `/login` | 只保护某个路径前缀 |
| `CLOUDFLARE_ZONE_ID` | 否 | `abcdef...` | 不想自动匹配 Zone 时填写 |
| `CLOUDFLARE_ZONE_NAME` | 否 | `example.com` | 用 Zone 名称匹配 |
| `SNIPPET_EXPRESSION` | 否 | `(http.host eq "www.example.com")` | 覆盖自动规则 |

`CLOUDFLARE_ZONE_ID` 通常不用填。只要 `CLOUDFLARE_API_TOKEN` 有 `Zone:Read`，Worker 会按 `PROTECTED_HOSTNAME` 自动匹配 Zone。

Token 权限：

| 范围 | 权限 |
| --- | --- |
| Zone | `Snippets:Edit` |
| Zone | `Zone:Read` |

## 安装

打开 Worker 首页：

```text
<Worker 地址>/
```

未安装时会进入安装页。输入运行时密钥里的 `CLOUDFLARE_API_TOKEN`，点击 `安装 Snippet`。

安装成功后自动进入工作台；之后刷新首页不再显示安装页。

## 工作台

工作台显示：

- Snippet 状态
- 保护范围
- Zone 匹配结果
- KV 黑名单状态
- 决策接口、状态接口、安装接口

重新安装或更新 Snippet 时，在工作台复制安装接口，或直接请求：

```bash
curl -X POST "<Worker 地址>/__edge-waf/install" \
  -H "x-api-token: <CLOUDFLARE_API_TOKEN>"
```

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
