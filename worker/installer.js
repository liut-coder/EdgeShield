import { getAuthState } from "./auth.js";
import { buildSnippetExpression, firstEnv, getEffectiveConfig } from "./config.js";

const API_BASE = "https://api.cloudflare.com/client/v4";

const ZONE_ID_NAMES = [
  "CLOUDFLARE_ZONE_ID",
  "CLOUDFLARE_ZONEID",
  "ZONE_ID",
  "ZONEID",
  "CF_ZONE_ID",
  "CF_ZONEID",
  "zoneid"
];

export async function installSnippet(request, env) {
  const auth = request.headers.get("x-api-token") || new URL(request.url).searchParams.get("token") || "";
  const authState = await getAuthState(request, env);

  if (!env.CLOUDFLARE_API_TOKEN || (auth !== env.CLOUDFLARE_API_TOKEN && !authState.user)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const apiToken = requiredEnv(env, "CLOUDFLARE_API_TOKEN");
  const config = await getEffectiveConfig(env);
  const zoneId = await resolveZoneId(config, apiToken);
  const snippetName = config.snippet_name || "edge_waf_gate";
  const snippetExpression = buildSnippetExpression(config);
  const decisionUrl = `${new URL(request.url).origin}/__edge-waf/decision`;
  const source = renderSnippet(decisionUrl);

  validateSnippetName(snippetName);

  if (!snippetExpression) {
    throw new Error("Set PROTECTED_HOSTNAME or SNIPPET_EXPRESSION");
  }

  await uploadSnippet({ apiToken, zoneId, snippetName, source });
  await upsertSnippetRule({ apiToken, zoneId, snippetName, expression: snippetExpression });

  return jsonResponse({
    ok: true,
    installed: true,
    zone_id: zoneId,
    snippet_name: snippetName,
    snippet_expression: snippetExpression,
    decision_url: decisionUrl
  });
}

export async function getInstallStatus(env, origin) {
  const apiToken = firstEnv(env, ["CLOUDFLARE_API_TOKEN"]);
  const config = await getEffectiveConfig(env);
  const snippetName = config.snippet_name || "edge_waf_gate";
  const snippetExpression = buildSnippetExpression(config);

  if (!apiToken) {
    return {
      installed: false,
      checked: false,
      reason: "CLOUDFLARE_API_TOKEN is not configured",
      snippet_name: snippetName,
      snippet_expression: snippetExpression,
      decision_url: `${origin}/__edge-waf/decision`
    };
  }

  try {
    const zoneId = await resolveZoneId(config, apiToken);
    const rules = await listSnippetRules(apiToken, zoneId);
    const rule = rules.find((item) => item.snippet_name === snippetName);

    return {
      installed: Boolean(rule?.enabled),
      checked: true,
      zone_id: zoneId,
      snippet_name: snippetName,
      snippet_expression: rule?.expression || snippetExpression,
      decision_url: `${origin}/__edge-waf/decision`
    };
  } catch (error) {
    return {
      installed: false,
      checked: false,
      reason: error.message || "install_status_unknown",
      snippet_name: snippetName,
      snippet_expression: snippetExpression,
      decision_url: `${origin}/__edge-waf/decision`
    };
  }
}

async function resolveZoneId(env, apiToken) {
  const explicitZoneId = env.cloudflare_zone_id || firstEnv(env, ZONE_ID_NAMES);

  if (explicitZoneId) {
    return explicitZoneId;
  }

  const zoneName = env.cloudflare_zone_name || firstEnv(env, ["CLOUDFLARE_ZONE_NAME", "ZONE_NAME"]);

  if (zoneName) {
    const zone = await findZone(apiToken, zoneName);
    return zone.id;
  }

  const protectedHostname = env.protected_hostname || firstEnv(env, ["PROTECTED_HOSTNAME", "HOSTNAME"]);

  if (protectedHostname) {
    const zones = await listZones(apiToken);
    const hostname = protectedHostname.toLowerCase();
    const match = zones
      .filter((zone) => hostname === zone.name || hostname.endsWith(`.${zone.name}`))
      .sort((a, b) => b.name.length - a.name.length)[0];

    if (match?.id) {
      return match.id;
    }
  }

  throw new Error("Set CLOUDFLARE_ZONE_ID, CLOUDFLARE_ZONE_NAME, or PROTECTED_HOSTNAME");
}

async function findZone(apiToken, zoneName) {
  const params = new URLSearchParams({ name: zoneName, per_page: "1" });
  const body = await cloudflareFetch(apiToken, `/zones?${params}`);
  const zone = body?.result?.[0];

  if (!zone?.id) {
    throw new Error(`Cloudflare zone not found: ${zoneName}`);
  }

  return zone;
}

async function listZones(apiToken) {
  const body = await cloudflareFetch(apiToken, "/zones?per_page=50");
  return Array.isArray(body?.result) ? body.result : [];
}

async function listSnippetRules(apiToken, zoneId) {
  const body = await cloudflareFetch(apiToken, `/zones/${zoneId}/snippets/snippet_rules`, {
    allowNotFound: true
  });

  return normalizeRules(body?.result ?? body);
}

async function uploadSnippet({ apiToken, zoneId, snippetName, source }) {
  const mainModule = "edge-gate.js";
  const form = new FormData();

  form.append("files", new Blob([source], { type: "application/javascript" }), mainModule);
  form.append("metadata", JSON.stringify({ main_module: mainModule }));

  await cloudflareFetch(apiToken, `/zones/${zoneId}/snippets/${snippetName}`, {
    method: "PUT",
    body: form
  });
}

async function upsertSnippetRule({ apiToken, zoneId, snippetName, expression }) {
  const existing = await cloudflareFetch(apiToken, `/zones/${zoneId}/snippets/snippet_rules`, {
    allowNotFound: true
  });
  const rules = normalizeRules(existing).filter((rule) => rule.snippet_name !== snippetName);

  rules.push({
    description: "Edge WAF gateway",
    enabled: true,
    expression,
    snippet_name: snippetName
  });

  await cloudflareFetch(apiToken, `/zones/${zoneId}/snippets/snippet_rules`, {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ rules })
  });
}

async function cloudflareFetch(apiToken, apiPath, { allowNotFound = false, headers = {}, ...options } = {}) {
  const response = await fetch(`${API_BASE}${apiPath}`, {
    ...options,
    headers: {
      authorization: `Bearer ${apiToken}`,
      accept: "application/json",
      ...headers
    }
  });
  const text = await response.text();
  const body = parseJson(text);

  if (response.status === 404 && allowNotFound) {
    return null;
  }

  if (!response.ok || body?.success === false) {
    throw new Error(`Cloudflare API error: ${formatApiError(body, text)}`);
  }

  return body;
}

function renderSnippet(decisionUrl) {
  return `const WAF_WORKER_URL = ${JSON.stringify(decisionUrl)};

const STATIC_PATHS = new Set([
  "/check.js",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml"
]);

const STATIC_EXTENSION_RE = /\\.(?:css|js|mjs|png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|map|txt|xml|pdf)$/i;

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (isStaticRequest(url.pathname)) {
      return fetch(request);
    }

    const decision = await fetchDecision(request, url).catch(() => null);

    if (!decision) {
      return new Response("WAF decision engine unavailable", {
        status: 503,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }

    if (decision.action === "allow") {
      return fetch(request);
    }

    if (decision.action === "challenge") {
      return new Response(decision.html || "", {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }

    if (decision.action === "block") {
      return new Response("Forbidden", {
        status: 403,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }

    return new Response("Invalid WAF decision", {
      status: 502,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }
};

function isStaticRequest(pathname) {
  return STATIC_PATHS.has(pathname) || STATIC_EXTENSION_RE.test(pathname);
}

async function fetchDecision(request, url) {
  const response = await fetch(WAF_WORKER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      ip: request.headers.get("CF-Connecting-IP") || "",
      ua: request.headers.get("User-Agent") || "",
      path: url.pathname,
      cookie: request.headers.get("Cookie") || ""
    })
  });

  if (!response.ok) {
    throw new Error("WAF worker returned an error");
  }

  return response.json();
}
`;
}

function normalizeRules(result) {
  if (!result) {
    return [];
  }

  if (Array.isArray(result.rules)) {
    return result.rules;
  }

  if (Array.isArray(result)) {
    return result;
  }

  return [];
}

function requiredEnv(env, name) {
  const value = firstEnv(env, [name]);

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function validateSnippetName(name) {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error("SNIPPET_NAME can only contain lowercase letters, digits, and underscores");
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function parseJson(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatApiError(body, fallback) {
  if (Array.isArray(body?.errors) && body.errors.length > 0) {
    return body.errors
      .map((error) => `${error.code || "error"} ${error.message || ""}`.trim())
      .join("; ");
  }

  return fallback || "empty response";
}
