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
      --bg: #f6f7fb;
      --panel: #ffffff;
      --text: #111827;
      --muted: #5b6472;
      --line: #d9dee8;
      --brand: #f38020;
      --brand-dark: #c96412;
      --ok: #0f7b45;
      --warn: #a15c00;
      --bad: #b42318;
      --code: #111827;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }

    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0 48px;
    }

    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      padding: 22px 0 28px;
    }

    .topline {
      color: var(--muted);
      font-size: 14px;
    }

    h1 {
      margin: 0;
      font-size: clamp(28px, 4vw, 44px);
      line-height: 1.05;
      letter-spacing: 0;
    }

    h2 {
      margin: 0 0 14px;
      font-size: 18px;
      letter-spacing: 0;
    }

    p {
      margin: 8px 0 0;
      color: var(--muted);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      height: 30px;
      padding: 0 10px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      color: var(--muted);
      font-size: 13px;
      white-space: nowrap;
    }

    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
      gap: 18px;
    }

    .panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 20px;
      box-shadow: 0 8px 24px rgb(17 24 39 / 6%);
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .item {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      background: #fbfcff;
      min-height: 86px;
    }

    .label {
      color: var(--muted);
      font-size: 13px;
    }

    .value {
      margin-top: 6px;
      font-weight: 650;
      overflow-wrap: anywhere;
    }

    .ok {
      color: var(--ok);
    }

    .warn {
      color: var(--warn);
    }

    .bad {
      color: var(--bad);
    }

    .stack {
      display: grid;
      gap: 14px;
    }

    form {
      display: grid;
      gap: 12px;
    }

    input {
      width: 100%;
      height: 42px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 0 12px;
      font: inherit;
      color: var(--text);
      background: #fff;
    }

    button {
      height: 42px;
      border: 0;
      border-radius: 6px;
      padding: 0 14px;
      font: inherit;
      font-weight: 650;
      color: #fff;
      background: var(--brand);
      cursor: pointer;
    }

    button:hover {
      background: var(--brand-dark);
    }

    button:disabled {
      cursor: wait;
      opacity: .7;
    }

    code,
    pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    }

    pre {
      margin: 14px 0 0;
      padding: 14px;
      border-radius: 8px;
      background: var(--code);
      color: #f9fafb;
      overflow: auto;
      font-size: 13px;
    }

    .endpoint {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 10px;
    }

    .endpoint code {
      flex: 1;
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      background: #fbfcff;
      overflow-wrap: anywhere;
      font-size: 13px;
    }

    .secondary {
      background: #1f2937;
    }

    .secondary:hover {
      background: #111827;
    }

    #result {
      min-height: 40px;
      margin-top: 12px;
      color: var(--muted);
      overflow-wrap: anywhere;
    }

    details {
      margin-top: 14px;
    }

    summary {
      cursor: pointer;
      color: var(--muted);
      font-size: 14px;
    }

    @media (max-width: 820px) {
      header,
      .grid,
      .cards {
        grid-template-columns: 1fr;
      }

      header {
        display: block;
      }

      .badge {
        margin-top: 14px;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>EdgeShield 控制台</h1>
        <div class="topline">${installed ? "工作台" : "安装"}</div>
      </div>
      <span class="badge">${installed ? "已安装" : "待安装"}</span>
    </header>

    <section class="grid">
      <div class="panel">
        <h2>运行状态</h2>
        <div class="cards">
          ${statusCard("Snippet", installed ? "已安装" : "未安装", installed)}
          ${statusCard("Cloudflare API Token", status.cloudflare_api_token_configured)}
          ${statusCard("保护域名", status.protected_hostname || "未设置", Boolean(status.protected_hostname))}
          ${statusCard("KV 黑名单", status.kv_bound ? "已绑定" : "未绑定", status.kv_bound)}
        </div>

        <div class="endpoint">
          <code id="decision-url">${escapeHtml(status.decision_url)}</code>
          <button class="secondary" type="button" data-copy="decision-url">复制</button>
        </div>
      </div>

      ${installed ? workspacePanel(status) : installPanel(status)}
    </section>

    <details>
      <summary>诊断信息</summary>
      <pre id="status-json">${statusJson}</pre>
    </details>
  </main>

  <script>
    const form = document.getElementById("install-form");

    if (form) {
      const button = document.getElementById("install-button");
      const result = document.getElementById("result");

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const token = document.getElementById("install-token").value.trim();

        if (!token) {
          result.textContent = "请先输入 CLOUDFLARE_API_TOKEN。";
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

          result.innerHTML = "安装完成，正在进入工作台...";
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
          copyButton.textContent = "复制";
        }, 1200);
      });
    });

    function escapeText(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);
    }
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

function statusCard(label, value, healthy = true) {
  let display = value;
  let className = healthy ? "ok" : "bad";

  if (typeof value === "boolean") {
    display = value ? "已设置" : "未设置";
  }

  if (typeof value === "string" && value === "未绑定") {
    className = "warn";
  }

  return `<div class="item">
    <div class="label">${escapeHtml(label)}</div>
    <div class="value ${className}">${escapeHtml(display)}</div>
  </div>`;
}

function installPanel(status) {
  const reason = status.reason ? `<p class="bad">${escapeHtml(status.reason)}</p>` : "";

  return `<div class="panel">
    <h2>安装</h2>
    ${reason}
    <form id="install-form">
      <input id="install-token" name="token" type="password" autocomplete="off" placeholder="输入 CLOUDFLARE_API_TOKEN" required>
      <button id="install-button" type="submit">安装 Snippet</button>
    </form>
    <div id="result">安装完成后自动进入工作台。</div>
  </div>`;
}

function workspacePanel(status) {
  return `<div class="panel">
    <h2>工作台</h2>
    <div class="stack">
      <div class="cards">
        ${statusCard("Snippet", status.snippet_name || "edge_waf_gate", true)}
        ${statusCard("规则", "启用中", true)}
      </div>
      <div class="endpoint">
        <code id="install-url">${escapeHtml(status.install_url)}</code>
        <button class="secondary" type="button" data-copy="install-url">复制安装接口</button>
      </div>
    </div>
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
