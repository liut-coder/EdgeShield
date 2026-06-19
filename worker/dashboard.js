import { getAuthState } from "./auth.js";
import { buildSnippetExpression, getEffectiveConfig } from "./config.js";
import { getInstallStatus } from "./installer.js";

export async function dashboardHtml(request, env) {
  const url = new URL(request.url);
  const status = await getRuntimeStatus(env, url.origin);
  const auth = await getAuthState(request, env);
  const statusJson = escapeHtml(JSON.stringify(status, null, 2));
  const installed = status.installed === true;
  const runtimeTokenConfigured = status.cloudflare_api_token_configured;

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

    .app-shell.setup-mode {
      min-height: calc(100vh - 40px);
      max-width: 1120px;
      overflow: hidden;
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
      grid-template-columns: minmax(190px, 240px) minmax(0, 1fr);
      align-items: start;
      max-width: 980px;
      margin: 0 auto;
    }

    .setup-mode .side,
    .setup-mode details {
      display: none;
    }

    .setup-mode .app-main {
      display: grid;
      grid-template-columns: 1fr;
      min-height: 0;
    }

    .setup-mode .content {
      padding: 28px;
      overflow: auto;
    }

    .setup-mode .wizard-side,
    .setup-mode .wizard-card {
      border: 0;
      background: transparent;
      box-shadow: none;
    }

    .setup-mode .wizard-side {
      padding: 0;
    }

    .setup-mode .install-screen {
      gap: 28px;
    }

    .setup-mode .wizard-brand {
      border: 0;
      padding: 6px 4px 14px;
    }

    .setup-mode .wizard-progress {
      gap: 8px;
    }

    .setup-mode .wizard-tab {
      min-height: 46px;
      border-color: transparent;
      background: rgb(255 255 255 / 56%);
      color: var(--muted);
    }

    .setup-mode .wizard-tab:hover {
      background: #fff;
      color: var(--text);
    }

    .setup-mode .wizard-tab.active {
      border-color: color-mix(in srgb, var(--brand) 28%, var(--line));
      background: #fff;
      box-shadow: 0 8px 18px rgb(15 23 42 / 6%);
    }

    .setup-mode .wizard-page {
      min-height: 520px;
      padding: 6px 4px 4px;
    }

    .setup-mode .wizard-title {
      padding-bottom: 18px;
    }

    .setup-mode .wizard-title h1 {
      font-size: clamp(30px, 4vw, 40px);
    }

    .setup-mode form {
      max-width: 640px;
    }

    .setup-mode input {
      height: 46px;
      border-color: #cfd8e6;
      background: rgb(255 255 255 / 82%);
    }

    .setup-mode .check-list,
    .setup-mode .kv-list {
      max-width: 680px;
    }

    .setup-mode .check-item,
    .setup-mode .kv {
      background: rgb(255 255 255 / 70%);
      border-color: var(--line-soft);
    }

    .setup-mode .wizard-actions {
      max-width: 640px;
      border-top-color: var(--line-soft);
    }

    .install-final {
      display: grid;
      align-content: start;
      max-width: 720px;
      gap: 18px;
    }

    .install-emblem {
      display: grid;
      width: 76px;
      height: 76px;
      place-items: center;
      border-radius: 18px;
      background: var(--brand);
      color: #fff;
      font-size: 34px;
      font-weight: 900;
      box-shadow: 0 18px 34px rgb(243 128 32 / 24%);
    }

    .install-summary {
      display: grid;
      gap: 10px;
    }

    .install-summary-row {
      display: grid;
      grid-template-columns: minmax(130px, .42fr) minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      min-height: 54px;
      border-bottom: 1px solid var(--line-soft);
      color: var(--muted);
    }

    .install-summary-row strong {
      color: var(--text);
      font-size: 14px;
    }

    .install-summary-row span {
      overflow-wrap: anywhere;
    }

    .install-final-actions {
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      padding-top: 6px;
    }

    .install-final-actions .btn-primary {
      min-width: 180px;
      min-height: 46px;
      font-size: 15px;
    }

    .workspace-grid {
      grid-template-columns: minmax(0, 1.35fr) minmax(320px, .85fr);
      align-items: start;
    }

    .auth-screen {
      max-width: 480px;
      margin: 48px auto 0;
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

    .wizard-side {
      position: sticky;
      top: 0;
      display: grid;
      gap: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 12px;
      box-shadow: 0 8px 24px rgb(15 23 42 / 5%);
    }

    .wizard-brand {
      display: grid;
      padding: 4px 4px 10px;
      border-bottom: 1px solid var(--line-soft);
    }

    .wizard-brand strong {
      font-size: 18px;
      line-height: 1.2;
    }

    .wizard-progress {
      display: grid;
      gap: 6px;
      margin-top: 2px;
    }

    .wizard-tab {
      display: grid;
      width: 100%;
      grid-template-columns: 28px minmax(0, 1fr);
      gap: 9px;
      align-items: center;
      min-height: 44px;
      border: 1px solid transparent;
      border-radius: 8px;
      padding: 7px 8px;
      background: transparent;
      color: var(--muted);
      text-align: left;
    }

    .wizard-tab strong {
      display: block;
      color: inherit;
      font-size: 14px;
      line-height: 1.2;
    }

    .wizard-tab span:last-child {
      display: block;
    }

    .wizard-tab-num {
      display: grid;
      width: 28px;
      height: 28px;
      place-items: center;
      border-radius: 8px;
      background: var(--panel-soft);
      color: var(--muted);
      font-size: 13px;
      font-weight: 800;
    }

    .wizard-tab.active {
      border-color: color-mix(in srgb, var(--brand) 26%, var(--line));
      background: #fff8f2;
      color: var(--brand-strong);
    }

    .wizard-tab.active .wizard-tab-num {
      background: var(--brand);
      color: #fff;
    }

    .wizard-card {
      min-height: 520px;
    }

    .wizard-step {
      display: none;
    }

    .wizard-step.active {
      display: block;
    }

    .wizard-page {
      display: grid;
      min-height: 466px;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: 18px;
      padding: 20px;
    }

    .wizard-title {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid var(--line-soft);
      padding-bottom: 16px;
    }

    .wizard-title h1 {
      font-size: clamp(24px, 3vw, 32px);
    }

    .wizard-actions {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      border-top: 1px solid var(--line-soft);
      padding-top: 16px;
    }

    .wizard-actions-end {
      justify-content: flex-end;
    }

    .check-list {
      display: grid;
      gap: 10px;
    }

    .check-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      min-height: 58px;
      border: 1px solid var(--line-soft);
      border-radius: 8px;
      background: var(--panel-soft);
      padding: 12px;
    }

    .check-item strong {
      display: block;
      color: var(--text);
      font-size: 14px;
    }

    .check-item span {
      display: block;
      margin-top: 2px;
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

      .app-shell.setup-mode {
        min-height: 100vh;
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

      .wizard-side {
        position: static;
      }

      .wizard-progress {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .wizard-tab {
        grid-template-columns: 1fr;
        justify-items: center;
        text-align: center;
      }

      .wizard-tab span:last-child {
        display: block;
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

      .wizard-actions {
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <div class="app-page">
    <div class="app-shell ${installed ? "" : "setup-mode"}">
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark">E</span>
          <span>EdgeShield</span>
        </div>
        <div class="topbar-actions">
          ${pill(installed ? "已安装" : "待安装", installed ? "ok" : "warn")}
          ${auth.user ? pill(auth.user.username, "ok") : ""}
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
          ${renderMainPanel(status, auth, installed)}

          <details>
            <summary>诊断</summary>
            <pre id="status-json">${statusJson}</pre>
          </details>
        </main>
      </div>
    </div>
  </div>

  <script>
    const runtimeTokenConfigured = ${runtimeTokenConfigured ? "true" : "false"};
    const wizardSteps = Array.from(document.querySelectorAll("[data-wizard-step]"));
    const wizardTabs = Array.from(document.querySelectorAll("[data-wizard-tab]"));
    let wizardIndex = 0;

    function setupToken() {
      const input = document.getElementById("setup-token");
      return input ? input.value.trim() : "";
    }

    function showWizardStep(nextIndex) {
      if (!wizardSteps.length) {
        return;
      }

      wizardIndex = Math.max(0, Math.min(nextIndex, wizardSteps.length - 1));

      wizardSteps.forEach((step, index) => {
        step.classList.toggle("active", index === wizardIndex);
      });

      wizardTabs.forEach((tab, index) => {
        const active = index === wizardIndex;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-current", active ? "step" : "false");
      });
    }

    document.querySelectorAll("[data-wizard-next]").forEach((button) => {
      button.addEventListener("click", () => showWizardStep(wizardIndex + 1));
    });

    document.querySelectorAll("[data-wizard-prev]").forEach((button) => {
      button.addEventListener("click", () => showWizardStep(wizardIndex - 1));
    });

    wizardTabs.forEach((tab, index) => {
      tab.addEventListener("click", () => showWizardStep(index));
    });

    const configForm = document.getElementById("config-form");
    const saveConfigButton = document.getElementById("save-config-button");

    if (configForm && saveConfigButton) {
      const configResult = document.getElementById("config-result");

      saveConfigButton.addEventListener("click", async () => {
        const token = setupToken();

        if (wizardSteps.length && !token) {
          configResult.textContent = "请先在授权步骤输入 Token。";
          return;
        }

        saveConfigButton.disabled = true;
        configResult.textContent = "正在保存规则...";

        try {
          const payload = {
            protected_hostname: document.getElementById("protected-hostname").value.trim(),
            protected_path_prefix: document.getElementById("protected-path-prefix").value.trim(),
            cloudflare_zone_id: document.getElementById("cloudflare-zone-id").value.trim(),
            snippet_expression: document.getElementById("snippet-expression").value.trim()
          };

          const response = await fetch("/__edge-waf/config", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(token ? { "x-api-token": token } : {})
            },
            body: JSON.stringify(payload)
          });
          const data = await response.json();

          if (!response.ok || !data.ok) {
            throw new Error(data.error || "config_save_failed");
          }

          configResult.textContent = "已保存到 D1。";
          if (wizardSteps.length) {
            showWizardStep(2);
          }
        } catch (error) {
          configResult.textContent = "保存失败：" + (error.message || error);
        } finally {
          saveConfigButton.disabled = false;
        }
      });
    }

    const adminSetupButton = document.getElementById("setup-admin-button");

    if (adminSetupButton) {
      adminSetupButton.addEventListener("click", async () => {
        if (adminSetupButton.dataset.skipSetup === "true") {
          showWizardStep(3);
          return;
        }

        const passwordInput = document.getElementById("admin-password");
        const result = document.getElementById("admin-setup-result");

        if (!passwordInput) {
          showWizardStep(3);
          return;
        }

        const username = document.getElementById("admin-username").value.trim();
        const password = passwordInput.value;
        const token = setupToken();

        if (!password && adminSetupButton.textContent.includes("下一步")) {
          showWizardStep(3);
          return;
        }

        if (!username || !password || !token) {
          result.textContent = "请填写用户名、密码，并先完成授权。";
          return;
        }

        adminSetupButton.disabled = true;
        result.textContent = "正在创建管理员...";

        try {
          const response = await fetch("/__edge-waf/auth/setup", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-token": token
            },
            body: JSON.stringify({ username, password })
          });
          const data = await response.json();

          if (!response.ok || !data.ok) {
            throw new Error(data.error || "setup_failed");
          }

          result.textContent = "管理员已创建。";
          if (wizardSteps.length) {
            showWizardStep(3);
          } else {
            window.location.reload();
          }
        } catch (error) {
          result.textContent = "创建失败：" + (error.message || error);
        } finally {
          adminSetupButton.disabled = false;
        }
      });
    }

    const loginForm = document.getElementById("login-form");

    if (loginForm) {
      const loginButton = document.getElementById("login-button");
      const loginResult = document.getElementById("login-result");

      loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        loginButton.disabled = true;
        loginResult.textContent = "正在登录...";

        try {
          const response = await fetch("/__edge-waf/auth/login", {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              username: document.getElementById("login-username").value.trim(),
              password: document.getElementById("login-password").value
            })
          });
          const data = await response.json();

          if (!response.ok || !data.ok) {
            throw new Error(data.error || "login_failed");
          }

          window.location.reload();
        } catch (error) {
          loginResult.textContent = "登录失败：" + (error.message || error);
        } finally {
          loginButton.disabled = false;
        }
      });
    }

    const logoutButton = document.getElementById("logout-button");

    if (logoutButton) {
      logoutButton.addEventListener("click", async () => {
        await fetch("/__edge-waf/auth/logout", { method: "POST" });
        window.location.reload();
      });
    }

    const form = document.getElementById("install-form");

    if (form) {
      const button = document.getElementById("install-button");
      const result = document.getElementById("result");

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const token = setupToken();

        if (!runtimeTokenConfigured) {
          alert("CLOUDFLARE_API_TOKEN is not configured");
          return;
        }

        if (!token) {
          result.textContent = "请先在授权步骤输入 Token。";
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
  const config = await getEffectiveConfig(env);
  const installStatus = await getInstallStatus(env, origin);

  return {
    ...installStatus,
    worker_url: origin,
    decision_url: `${origin}/__edge-waf/decision`,
    install_url: `${origin}/__edge-waf/install`,
    cloudflare_api_token_configured: Boolean(env.CLOUDFLARE_API_TOKEN),
    protected_hostname: config.protected_hostname,
    protected_path_prefix: config.protected_path_prefix,
    cloudflare_zone_id: config.cloudflare_zone_id,
    cloudflare_zone_name: config.cloudflare_zone_name,
    snippet_name: installStatus.snippet_name || config.snippet_name || "edge_waf_gate",
    snippet_expression: installStatus.snippet_expression || buildSnippetExpression(config),
    snippet_rules: config.snippet_rules,
    config_source: config.config_source,
    d1_bound: config.d1_bound,
    zone_configured: Boolean(config.cloudflare_zone_id || config.cloudflare_zone_name || config.protected_hostname),
    kv_bound: Boolean(env.KV)
  };
}

function renderMainPanel(status, auth, installed) {
  if (!installed) {
    return installPanel(status, auth);
  }

  if (!auth.available) {
    return authUnavailablePanel();
  }

  if (!auth.has_users) {
    return adminSetupPanel();
  }

  if (!auth.user) {
    return loginPanel();
  }

  return workspacePanel(status, auth.user);
}

function installPanel(status, auth) {
  return `<section class="screen install-screen">
    <aside class="wizard-side" aria-label="安装进度">
      <div class="wizard-brand">
        <strong>安装 EdgeShield</strong>
      </div>
      <div class="wizard-progress">
        ${wizardTab(0, "授权", "", true)}
        ${wizardTab(1, "规则", "", false)}
        ${wizardTab(2, "账号", "", false)}
        ${wizardTab(3, "安装", "", false)}
      </div>
    </aside>

    <section class="panel wizard-card">
      <div class="wizard-step active" data-wizard-step="0">
        <div class="wizard-page">
          <div class="wizard-title">
            <div>
              <h1>授权</h1>
            </div>
          </div>

          <form>
            <label>
              Cloudflare Token
              <input id="setup-token" type="password" autocomplete="off" placeholder="只在本次安装流程中使用">
            </label>
            <div class="check-list">
              ${checkItem("Token 状态", status.cloudflare_api_token_configured ? "运行时密钥已配置" : "运行时密钥缺失", status.cloudflare_api_token_configured)}
              ${checkItem("D1 数据库", status.d1_bound ? "已绑定" : "未绑定", status.d1_bound)}
              ${checkItem("KV 黑名单", status.kv_bound ? "已绑定" : "未绑定，可稍后配置", true)}
            </div>
          </form>

          <div class="wizard-actions wizard-actions-end">
            <button class="btn btn-primary" type="button" data-wizard-next>下一步</button>
          </div>
        </div>
      </div>

      <div class="wizard-step" data-wizard-step="1">
        <div class="wizard-page">
          <div class="wizard-title">
            <div>
              <h1>规则</h1>
            </div>
            ${pill(status.d1_bound ? "D1 已绑定" : "D1 未绑定", status.d1_bound ? "ok" : "bad")}
          </div>

          <form id="config-form">
            <label>
              保护域名
              <input id="protected-hostname" name="protected_hostname" autocomplete="off" placeholder="www.example.com" value="${escapeAttribute(status.protected_hostname || "")}">
            </label>
            <label>
              路径前缀
              <input id="protected-path-prefix" name="protected_path_prefix" autocomplete="off" placeholder="可留空" value="${escapeAttribute(status.protected_path_prefix || "")}">
            </label>
            <label>
              Zone ID
              <input id="cloudflare-zone-id" name="cloudflare_zone_id" autocomplete="off" placeholder="可留空自动匹配" value="${escapeAttribute(status.cloudflare_zone_id || status.zone_id || "")}">
            </label>
            <label>
              Snippet 规则
              <input id="snippet-expression" name="snippet_expression" autocomplete="off" placeholder='(http.host eq "www.example.com")' value="${escapeAttribute(status.snippet_expression || "")}">
            </label>
            <div id="config-result" class="result">${status.d1_bound ? "可保存到 D1。" : "绑定 D1 后可保存规则；当前只能使用运行时变量。"}</div>
          </form>

          <div class="wizard-actions">
            <button class="btn btn-secondary" type="button" data-wizard-prev>上一步</button>
            <button class="btn btn-primary" id="save-config-button" type="button">保存并继续</button>
          </div>
        </div>
      </div>

      <div class="wizard-step" data-wizard-step="2">
        <div class="wizard-page">
          <div class="wizard-title">
            <div>
              <h1>账号</h1>
            </div>
            ${pill(auth.available ? (auth.has_users ? "已创建" : "待创建") : "D1 未绑定", auth.available && auth.has_users ? "ok" : "warn")}
          </div>

          <form id="admin-setup-form">
            <label>
              用户名
              <input id="admin-username" name="username" autocomplete="username" placeholder="admin" value="admin">
            </label>
            <label>
              密码
              <input id="admin-password" name="password" type="password" autocomplete="new-password" placeholder="至少 10 位">
            </label>
            <div id="admin-setup-result" class="result">${auth.has_users ? "管理员已创建。" : "创建后用于登录工作台。"}</div>
          </form>

          <div class="wizard-actions">
            <button class="btn btn-secondary" type="button" data-wizard-prev>上一步</button>
            <button class="btn btn-primary" id="setup-admin-button" type="button" data-skip-setup="${auth.has_users ? "true" : "false"}">${auth.has_users ? "下一步" : "创建并继续"}</button>
          </div>
        </div>
      </div>

      <div class="wizard-step" data-wizard-step="3">
        <div class="wizard-page">
          <div class="wizard-title">
            <div>
              <h1>安装 Snippet</h1>
            </div>
            ${pill("最后一步", "warn")}
          </div>

          <form id="install-form">
            <div class="install-final">
              <div class="install-emblem">E</div>
              <div class="install-summary">
                ${installSummaryRow("保护域名", status.protected_hostname || "未设置", Boolean(status.protected_hostname))}
                ${installSummaryRow("D1 规则", status.d1_bound ? "已就绪" : "未绑定", status.d1_bound)}
                ${installSummaryRow("管理员", auth.has_users ? "已创建" : "未创建", auth.has_users)}
                ${installSummaryRow("Snippet", status.snippet_name || "edge_waf_gate", true)}
              </div>
              <div id="result" class="result">点击安装后会创建或更新 Cloudflare Snippet。</div>
            </div>
            <div class="wizard-actions install-final-actions">
              <button class="btn btn-secondary" type="button" data-wizard-prev>上一步</button>
              <button id="install-button" class="btn btn-primary" type="submit">安装 Snippet</button>
            </div>
          </form>
        </div>
      </div>
    </section>
  </section>`;
}

function authUnavailablePanel() {
  return `<section class="panel auth-screen">
    <div class="panel-head">
      <h1>需要 D1</h1>
      ${pill("未绑定", "bad")}
    </div>
    <div class="panel-body">
      <p>D1 用于保存账号、会话和 Snippet 规则。绑定 DB 后重新部署，再打开工作台。</p>
    </div>
  </section>`;
}

function adminSetupPanel() {
  return `<section class="panel auth-screen">
    <div class="panel-head">
      <h1>创建管理员</h1>
      ${pill("首次登录", "warn")}
    </div>
    <div class="panel-body">
      <form id="admin-setup-form">
        <label>
          用户名
          <input id="admin-username" name="username" autocomplete="username" placeholder="admin" value="admin">
        </label>
        <label>
          密码
          <input id="admin-password" name="password" type="password" autocomplete="new-password" placeholder="至少 10 位">
        </label>
        <label>
          CLOUDFLARE_API_TOKEN
          <input id="admin-setup-token" name="token" type="password" autocomplete="off" placeholder="用于首次创建管理员">
        </label>
        <div id="admin-setup-result" class="result">Token 只用于初始化，不会保存。</div>
        <button class="btn btn-primary" id="setup-admin-button" type="button">创建管理员</button>
      </form>
    </div>
  </section>`;
}

function loginPanel() {
  return `<section class="panel auth-screen">
    <div class="panel-head">
      <h1>登录</h1>
      ${pill("工作台", "ok")}
    </div>
    <div class="panel-body">
      <form id="login-form">
        <label>
          用户名
          <input id="login-username" name="username" autocomplete="username" placeholder="admin">
        </label>
        <label>
          密码
          <input id="login-password" name="password" type="password" autocomplete="current-password">
        </label>
        <div id="login-result" class="result">登录后进入工作台。</div>
        <button class="btn btn-primary" id="login-button" type="submit">登录</button>
      </form>
    </div>
  </section>`;
}

function workspacePanel(status, user) {
  return `<section class="screen">
    <section class="panel">
      <div class="panel-head">
        <div>
          <h1>工作台</h1>
          <p>${escapeHtml(user.username)}</p>
        </div>
        <button class="btn btn-secondary" id="logout-button" type="button">退出</button>
      </div>
      <div class="panel-body">
        <div class="stat-grid">
          ${statCard("Snippet", status.snippet_name || "edge_waf_gate", "ok")}
          ${statCard("保护域名", status.protected_hostname || "未设置", status.protected_hostname ? "ok" : "bad")}
          ${statCard("D1 规则库", status.d1_bound ? "已绑定" : "未绑定", status.d1_bound ? "ok" : "bad")}
          ${statCard("KV 黑名单", status.kv_bound ? "已绑定" : "未绑定", status.kv_bound ? "ok" : "warn")}
        </div>
      </div>
    </section>

    <section class="screen workspace-grid">
      <section class="panel">
        <div class="panel-head">
          <h2 class="panel-title">规则</h2>
          ${pill(status.installed ? "已生效" : "未生效", status.installed ? "ok" : "bad")}
        </div>
        <div class="panel-body">
          <form id="config-form">
            <label>
              保护域名
              <input id="protected-hostname" name="protected_hostname" autocomplete="off" value="${escapeAttribute(status.protected_hostname || "")}">
            </label>
            <label>
              路径前缀
              <input id="protected-path-prefix" name="protected_path_prefix" autocomplete="off" placeholder="全部路径" value="${escapeAttribute(status.protected_path_prefix || "")}">
            </label>
            <label>
              Zone ID
              <input id="cloudflare-zone-id" name="cloudflare_zone_id" autocomplete="off" placeholder="自动匹配" value="${escapeAttribute(status.cloudflare_zone_id || status.zone_id || "")}">
            </label>
            <label>
              Snippet 规则
              <input id="snippet-expression" name="snippet_expression" autocomplete="off" value="${escapeAttribute(status.snippet_expression || "")}">
            </label>
            <div id="config-result" class="result">保存后重新安装 Snippet 生效。</div>
            <button class="btn btn-primary" id="save-config-button" type="button">保存规则</button>
          </form>
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

function wizardTab(index, title, meta, active) {
  return `<button class="wizard-tab ${active ? "active" : ""}" type="button" data-wizard-tab="${index}" aria-current="${active ? "step" : "false"}">
    <span class="wizard-tab-num">${index + 1}</span>
    <span>
      <strong>${escapeHtml(title)}</strong>
    </span>
  </button>`;
}

function checkItem(label, value, configured) {
  return `<div class="check-item">
    <span>
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(value)}</span>
    </span>
    ${pill(configured ? "已就绪" : "缺少", configured ? "ok" : "bad")}
  </div>`;
}

function installSummaryRow(label, value, ok) {
  return `<div class="install-summary-row">
    <strong>${escapeHtml(label)}</strong>
    <span>${escapeHtml(value)}</span>
    ${pill(ok ? "就绪" : "缺少", ok ? "ok" : "bad")}
  </div>`;
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
