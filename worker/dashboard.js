import { getInstallStatus } from "./installer.js";

export async function dashboardHtml(request, env) {
  const url = new URL(request.url);
  const status = await getRuntimeStatus(env, url.origin);
  const statusJson = escapeHtml(JSON.stringify(status, null, 2));
  const installed = status.installed === true;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>EdgeShield 控制台</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #eef2f7;
      --shell: #f8fafc;
      --panel: #ffffff;
      --panel-soft: #f8fafc;
      --text: #0f172a;
      --muted: #64748b;
      --line: #d8e0eb;
      --line-soft: #e7edf5;
      --brand: #f38020;
      --brand-strong: #c95f0c;
      --blue: #2563eb;
      --blue-soft: #eff6ff;
      --ok: #047857;
      --ok-soft: #ecfdf5;
      --warn: #b45309;
      --warn-soft: #fff7ed;
      --bad: #b42318;
      --bad-soft: #fef2f2;
      --code: #111827;
      --shadow: 0 20px 56px rgb(15 23 42 / 12%), 0 8px 22px rgb(15 23 42 / 8%);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: linear-gradient(180deg, #f7f9fc 0%, var(--bg) 100%);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }

    button,
    input {
      font: inherit;
    }

    button {
      cursor: pointer;
    }

    .app-page {
      min-height: 100vh;
      padding: 20px;
    }

    .app-shell {
      display: flex;
      flex-direction: column;
      min-height: calc(100vh - 40px);
      max-width: 1440px;
      margin: 0 auto;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: var(--shell);
      box-shadow: var(--shadow);
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      min-height: 58px;
      padding: 12px 18px;
      border-bottom: 1px solid var(--line-soft);
      background: rgb(255 255 255 / 78%);
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0;
    }

    .brand-mark {
      display: grid;
      width: 34px;
      height: 34px;
      place-items: center;
      border-radius: 8px;
      background: var(--brand);
      color: #fff;
      font-weight: 900;
    }

    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .badge,
    .pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 28px;
      gap: 6px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
    }

    .badge {
      padding: 0 10px;
    }

    .pill {
      padding: 3px 9px;
    }

    .pill.ok {
      border-color: color-mix(in srgb, var(--ok) 28%, var(--line));
      background: var(--ok-soft);
      color: var(--ok);
    }

    .pill.warn {
      border-color: color-mix(in srgb, var(--warn) 28%, var(--line));
      background: var(--warn-soft);
      color: var(--warn);
    }

    .pill.bad {
      border-color: color-mix(in srgb, var(--bad) 28%, var(--line));
      background: var(--bad-soft);
      color: var(--bad);
    }

    .stat-value.ok,
    .result.ok {
      color: var(--ok);
    }

    .stat-value.warn,
    .result.warn {
      color: var(--warn);
    }

    .stat-value.bad,
    .result.bad {
      color: var(--bad);
    }

    .app-main {
      display: grid;
      flex: 1;
      min-height: 0;
      grid-template-columns: 208px minmax(0, 1fr);
    }

    .side {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px 12px;
      border-right: 1px solid var(--line-soft);
    }

    .side-link {
      display: flex;
      align-items: center;
      gap: 9px;
      min-height: 40px;
      border: 1px solid transparent;
      border-radius: 8px;
      padding: 0 11px;
      color: var(--muted);
      font-size: 14px;
      font-weight: 650;
      text-decoration: none;
    }

    .side-link.active {
      border-color: color-mix(in srgb, var(--blue) 24%, var(--line));
      background: var(--blue-soft);
      color: var(--blue);
    }

    .side-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: currentColor;
    }

    .side-foot {
      margin-top: auto;
      padding: 10px;
      border: 1px solid var(--line-soft);
      border-radius: 8px;
      background: #fff;
      color: var(--muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }

    .content {
      min-width: 0;
      overflow: auto;
      padding: 16px;
    }

    .screen {
      display: grid;
      gap: 14px;
    }

    .install-screen {
      grid-template-columns: minmax(0, 1fr) 360px;
      align-items: start;
    }

    .workspace-grid {
      grid-template-columns: minmax(0, 1.35fr) minmax(320px, .85fr);
      align-items: start;
    }

    .panel {
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 8px 24px rgb(15 23 42 / 5%);
    }

    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 52px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line-soft);
    }

    .panel-title {
      margin: 0;
      font-size: 16px;
      line-height: 1.25;
      letter-spacing: 0;
    }

    .panel-body {
      padding: 16px;
    }

    .hero-install {
      display: grid;
      gap: 16px;
      padding: 18px;
      border: 1px solid color-mix(in srgb, var(--brand) 24%, var(--line));
      border-radius: 8px;
      background: linear-gradient(180deg, #fff 0%, #fff8f2 100%);
    }

    .hero-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
    }

    h1 {
      margin: 0;
      font-size: clamp(24px, 4vw, 34px);
      line-height: 1.1;
      letter-spacing: 0;
    }

    p {
      margin: 6px 0 0;
      color: var(--muted);
    }

    .step-list {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .step {
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr);
      gap: 10px;
      align-items: start;
      min-height: 48px;
      border: 1px solid var(--line-soft);
      border-radius: 8px;
      padding: 9px;
      background: #fff;
    }

    .step-num {
      display: grid;
      width: 28px;
      height: 28px;
      place-items: center;
      border-radius: 8px;
      background: var(--blue-soft);
      color: var(--blue);
      font-size: 13px;
      font-weight: 800;
    }

    .step strong,
    .kv strong,
    .endpoint strong {
      display: block;
      color: var(--text);
      font-size: 14px;
    }

    .step span,
    .kv span,
    .endpoint span {
      display: block;
      margin-top: 1px;
      color: var(--muted);
      font-size: 13px;
      overflow-wrap: anywhere;
    }

    form {
      display: grid;
      gap: 10px;
    }

    label {
      display: grid;
      gap: 6px;
      color: var(--text);
      font-size: 13px;
      font-weight: 700;
    }

    input {
      width: 100%;
      height: 42px;
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 12px;
      background: #fff;
      color: var(--text);
    }

    input:focus {
      border-color: var(--brand);
      outline: 3px solid rgb(243 128 32 / 16%);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      border: 1px solid transparent;
      border-radius: 8px;
      padding: 0 13px;
      font-weight: 760;
      text-decoration: none;
      white-space: nowrap;
    }

    .btn-primary {
      background: var(--brand);
      color: #fff;
    }

    .btn-primary:hover {
      background: var(--brand-strong);
    }

    .btn-secondary {
      border-color: var(--line);
      background: #fff;
      color: var(--text);
    }

    .btn-secondary:hover {
      border-color: color-mix(in srgb, var(--blue) 28%, var(--line));
      color: var(--blue);
    }

    .btn:disabled {
      cursor: wait;
      opacity: .68;
    }

    .result {
      min-height: 22px;
      color: var(--muted);
      font-size: 14px;
      overflow-wrap: anywhere;
    }

    .stat-grid {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .stat {
      display: grid;
      gap: 7px;
      min-height: 86px;
      border: 1px solid var(--line-soft);
      border-radius: 8px;
      padding: 12px;
      background: var(--panel-soft);
    }

    .stat-label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }

    .stat-value {
      min-width: 0;
      color: var(--text);
      font-weight: 800;
      overflow-wrap: anywhere;
    }

    .kv-list,
    .endpoint-list {
      display: grid;
      gap: 9px;
    }

    .kv,
    .endpoint {
      display: grid;
      gap: 8px;
      border: 1px solid var(--line-soft);
      border-radius: 8px;
      padding: 11px;
      background: var(--panel-soft);
    }

    .endpoint {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
    }

    .endpoint code {
      display: block;
      overflow-wrap: anywhere;
      color: var(--text);
      font-size: 13px;
    }

    .table {
      display: grid;
      overflow: hidden;
      border: 1px solid var(--line-soft);
      border-radius: 8px;
    }

    .row {
      display: grid;
      grid-template-columns: minmax(180px, .72fr) minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      min-height: 48px;
      padding: 9px 11px;
      background: #fff;
    }

    .row + .row {
      border-top: 1px solid var(--line-soft);
    }

    .row code {
      color: var(--text);
      font-size: 13px;
      overflow-wrap: anywhere;
    }

    .row span {
      color: var(--muted);
      font-size: 13px;
    }

    code,
    pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    }

    details {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }

    summary {
      cursor: pointer;
      padding: 12px 14px;
      color: var(--muted);
      font-size: 14px;
      font-weight: 700;
    }

    pre {
      margin: 0;
      padding: 14px;
      border-top: 1px solid var(--line-soft);
      background: var(--code);
      color: #f9fafb;
      overflow: auto;
      font-size: 13px;
    }

    @media (max-width: 1080px) {
      .install-screen,
      .workspace-grid,
      .stat-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 760px) {
      .app-page {
        padding: 0;
      }

      .app-shell {
        min-height: 100vh;
        border-radius: 0;
        border-left: 0;
        border-right: 0;
      }

      .topbar {
        align-items: flex-start;
      }

      .topbar-actions {
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .app-main {
        grid-template-columns: 1fr;
      }

      .side {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(110px, 1fr);
        overflow-x: auto;
        border-right: 0;
        border-bottom: 1px solid var(--line-soft);
      }

      .side-foot {
        display: none;
      }

      .content {
        padding: 12px;
      }

      .hero-row,
      .panel-head {
        align-items: flex-start;
        flex-direction: column;
      }

      .row {
        grid-template-columns: 1fr;
      }

      .endpoint {
        grid-template-columns: 1fr;
      }

      .btn {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="app-page">
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark">E</span>
          <span>EdgeShield</span>
        </div>
        <div class="topbar-actions">
          ${pill(installed ? "已安装" : "待安装", installed ? "ok" : "warn")}
          ${pill(status.cloudflare_api_token_configured ? "Token 已配置" : "Token 未配置", status.cloudflare_api_token_configured ? "ok" : "bad")}
        </div>
      </header>

      <div class="app-main">
        <aside class="side">
          ${navItem(installed ? "总览" : "安装", true)}
          ${navItem("范围", false)}
          ${navItem("接口", false)}
          ${navItem("诊断", false)}
          <div class="side-foot">
            <strong>决策接口</strong>
            <span>${escapeHtml(status.decision_url)}</span>
          </div>
        </aside>

        <main class="content">
          ${installed ? workspacePanel(status) : installPanel(status)}

          <details>
            <summary>诊断</summary>
            <pre id="status-json">${statusJson}</pre>
          </details>
        </main>
      </div>
    </div>
  </div>

  <script>
    const form = document.getElementById("install-form");

    if (form) {
      const button = document.getElementById("install-button");
      const result = document.getElementById("result");

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const token = document.getElementById("install-token").value.trim();

        if (!token) {
          result.textContent = "请输入 CLOUDFLARE_API_TOKEN。";
          return;
        }

        button.disabled = true;
        result.textContent = "正在安装 Snippet...";

        try {
          const response = await fetch("/__edge-waf/install", {
            method: "POST",
            headers: {
              "x-api-token": token
            }
          });
          const data = await response.json();

          if (!response.ok || !data.ok) {
            throw new Error(data.error || "install_failed");
          }

          result.textContent = "安装完成，正在进入工作台...";
          setTimeout(() => {
            window.location.reload();
          }, 700);
        } catch (error) {
          result.textContent = "安装失败：" + (error.message || error);
        } finally {
          button.disabled = false;
        }
      });
    }

    document.querySelectorAll("[data-copy]").forEach((copyButton) => {
      copyButton.addEventListener("click", async () => {
        const target = document.getElementById(copyButton.dataset.copy);
        await navigator.clipboard.writeText(target.textContent);
        copyButton.textContent = "已复制";
        setTimeout(() => {
          copyButton.textContent = copyButton.dataset.label || "复制";
        }, 1200);
      });
    });
  </script>
</body>
</html>`;
}

export async function statusResponse(request, env) {
  const status = await getRuntimeStatus(env, new URL(request.url).origin);

  return new Response(JSON.stringify(status, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

async function getRuntimeStatus(env, origin) {
  const protectedHostname = firstEnv(env, ["PROTECTED_HOSTNAME", "HOSTNAME"]);
  const protectedPathPrefix = firstEnv(env, ["PROTECTED_PATH_PREFIX", "PATH_PREFIX"]);
  const snippetExpression = env.SNIPPET_EXPRESSION || buildSnippetExpression(protectedHostname, protectedPathPrefix);
  const installStatus = await getInstallStatus(env, origin);

  return {
    ...installStatus,
    worker_url: origin,
    decision_url: `${origin}/__edge-waf/decision`,
    install_url: `${origin}/__edge-waf/install`,
    cloudflare_api_token_configured: Boolean(env.CLOUDFLARE_API_TOKEN),
    protected_hostname: protectedHostname,
    protected_path_prefix: protectedPathPrefix,
    snippet_name: installStatus.snippet_name || env.SNIPPET_NAME || "edge_waf_gate",
    snippet_expression: installStatus.snippet_expression || snippetExpression,
    zone_configured: Boolean(firstEnv(env, [
      "CLOUDFLARE_ZONE_ID",
      "CLOUDFLARE_ZONEID",
      "ZONE_ID",
      "ZONEID",
      "CF_ZONE_ID",
      "CF_ZONEID",
      "zoneid",
      "CLOUDFLARE_ZONE_NAME",
      "ZONE_NAME"
    ]) || protectedHostname),
    kv_bound: Boolean(env.KV)
  };
}

function installPanel(status) {
  const reason = status.reason ? `<div class="result bad">${escapeHtml(status.reason)}</div>` : "";

  return `<section class="screen install-screen">
    <div class="hero-install">
      <div class="hero-row">
        <div>
          <h1>安装 EdgeShield</h1>
          <p>变量在 Cloudflare 运行时配置；这里只负责创建 Snippet。</p>
        </div>
        ${pill("1 分钟", "warn")}
      </div>

      <ol class="step-list">
        <li class="step">
          <span class="step-num">1</span>
          <span><strong>配置变量</strong><span>CLOUDFLARE_API_TOKEN 和 PROTECTED_HOSTNAME</span></span>
        </li>
        <li class="step">
          <span class="step-num">2</span>
          <span><strong>安装 Snippet</strong><span>输入同一个 CLOUDFLARE_API_TOKEN 执行安装</span></span>
        </li>
        <li class="step">
          <span class="step-num">3</span>
          <span><strong>进入工作台</strong><span>安装成功后此页面自动切换</span></span>
        </li>
      </ol>
    </div>

    <div class="screen">
      <section class="panel">
        <div class="panel-head">
          <h2 class="panel-title">Snippet 安装</h2>
          ${pill(status.cloudflare_api_token_configured ? "Token 已配置" : "Token 未配置", status.cloudflare_api_token_configured ? "ok" : "bad")}
        </div>
        <div class="panel-body">
          <form id="install-form">
            <label>
              CLOUDFLARE_API_TOKEN
              <input id="install-token" name="token" type="password" autocomplete="off" placeholder="粘贴运行时密钥中的 Token" required>
            </label>
            <button id="install-button" class="btn btn-primary" type="submit">安装 Snippet</button>
            <div id="result" class="result">安装完成后自动进入工作台。</div>
            ${reason}
          </form>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2 class="panel-title">运行时变量</h2>
          ${pill(status.zone_configured ? "范围已配置" : "范围未配置", status.zone_configured ? "ok" : "bad")}
        </div>
        <div class="panel-body">
          <div class="table">
            ${variableRow("CLOUDFLARE_API_TOKEN", "必填", status.cloudflare_api_token_configured)}
            ${variableRow("PROTECTED_HOSTNAME", status.protected_hostname || "必填", Boolean(status.protected_hostname))}
            ${variableRow("PROTECTED_PATH_PREFIX", status.protected_path_prefix || "可选", true)}
            ${variableRow("CLOUDFLARE_ZONE_ID", status.zone_id || "可选，通常自动匹配", status.zone_configured)}
            ${variableRow("SNIPPET_EXPRESSION", status.snippet_expression || "可选", true)}
          </div>
        </div>
      </section>
    </div>
  </section>`;
}

function workspacePanel(status) {
  return `<section class="screen">
    <section class="panel">
      <div class="panel-head">
        <h1>工作台</h1>
        ${pill("防护启用", "ok")}
      </div>
      <div class="panel-body">
        <div class="stat-grid">
          ${statCard("Snippet", status.snippet_name || "edge_waf_gate", "ok")}
          ${statCard("保护域名", status.protected_hostname || "未设置", status.protected_hostname ? "ok" : "bad")}
          ${statCard("Zone", status.zone_id || "自动匹配", status.zone_configured ? "ok" : "warn")}
          ${statCard("KV 黑名单", status.kv_bound ? "已绑定" : "未绑定", status.kv_bound ? "ok" : "warn")}
        </div>
      </div>
    </section>

    <section class="screen workspace-grid">
      <section class="panel">
        <div class="panel-head">
          <h2 class="panel-title">范围</h2>
          ${pill(status.installed ? "已生效" : "未生效", status.installed ? "ok" : "bad")}
        </div>
        <div class="panel-body">
          <div class="kv-list">
            ${kvItem("规则表达式", status.snippet_expression || "未设置")}
            ${kvItem("路径前缀", status.protected_path_prefix || "全部路径")}
            ${kvItem("决策动作", "allow / challenge / block")}
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2 class="panel-title">接口</h2>
          ${pill("可复制", "ok")}
        </div>
        <div class="panel-body">
          <div class="endpoint-list">
            ${endpointItem("decision-url", "决策接口", status.decision_url, "复制")}
            ${endpointItem("status-url", "状态接口", `${status.worker_url}/__edge-waf/status`, "复制")}
            ${endpointItem("install-url", "安装接口", status.install_url, "复制")}
          </div>
        </div>
      </section>
    </section>
  </section>`;
}

function navItem(label, active) {
  return `<a class="side-link ${active ? "active" : ""}" href="#">
    <span class="side-dot"></span>
    <span>${escapeHtml(label)}</span>
  </a>`;
}

function pill(label, tone) {
  return `<span class="pill ${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function statCard(label, value, tone) {
  return `<div class="stat">
    <span class="stat-label">${escapeHtml(label)}</span>
    <strong class="stat-value ${escapeHtml(tone)}">${escapeHtml(value)}</strong>
  </div>`;
}

function kvItem(label, value) {
  return `<div class="kv">
    <strong>${escapeHtml(label)}</strong>
    <span>${escapeHtml(value)}</span>
  </div>`;
}

function endpointItem(id, label, value, copyLabel) {
  return `<div class="endpoint">
    <span>
      <strong>${escapeHtml(label)}</strong>
      <code id="${escapeHtml(id)}">${escapeHtml(value)}</code>
    </span>
    <button class="btn btn-secondary" type="button" data-copy="${escapeHtml(id)}" data-label="${escapeHtml(copyLabel)}">${escapeHtml(copyLabel)}</button>
  </div>`;
}

function variableRow(name, value, configured) {
  return `<div class="row">
    <code>${escapeHtml(name)}</code>
    <span>${escapeHtml(value)}</span>
    ${pill(configured ? "已就绪" : "缺少", configured ? "ok" : "bad")}
  </div>`;
}

function buildSnippetExpression(hostname, pathPrefix) {
  if (!hostname) {
    return "";
  }

  const hostExpression = `(http.host eq "${hostname}")`;

  if (!pathPrefix) {
    return hostExpression;
  }

  return `(${hostExpression} and starts_with(http.request.uri.path, "${pathPrefix}"))`;
}

function firstEnv(env, names) {
  for (const name of names) {
    const value = env[name];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}
