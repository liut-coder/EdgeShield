import { getAuthState, isSetupAuthorized } from "./auth.js";
import { executeD1Schema, hasD1Binding } from "./bindings.js";

const CONFIG_TABLE = "edge_waf_config";
const RULES_TABLE = "edge_waf_rules";
const DEFAULT_RULE_ID = "primary";

const CONFIG_KEYS = new Set([
  "protected_hostname",
  "protected_path_prefix",
  "cloudflare_zone_id",
  "cloudflare_zone_name",
  "snippet_name"
]);

export async function getEffectiveConfig(env) {
  const envConfig = readEnvConfig(env);

  if (!hasD1Binding(env.DB)) {
    return {
      ...envConfig,
      d1_bound: false,
      config_source: "env",
      snippet_rules: []
    };
  }

  await ensureSchema(env.DB);
  const storedConfig = await readStoredConfig(env.DB);
  const rules = await readRules(env.DB);
  const enabledRules = rules.filter((rule) => rule.enabled);
  const storedExpression = buildRulesExpression(enabledRules);

  return {
    ...envConfig,
    ...storedConfig,
    d1_bound: true,
    config_source: Object.keys(storedConfig).length || rules.length ? "d1" : "env",
    snippet_rules: rules,
    snippet_expression: storedExpression || envConfig.snippet_expression
  };
}

export async function saveConfigResponse(request, env) {
  if (!hasD1Binding(env.DB)) {
    return jsonResponse({ error: "D1 binding DB is required" }, 400);
  }

  const authState = await getAuthState(request, env);
  const setupAuthorized = await isSetupAuthorized(request, env);

  if (!authState.user && !setupAuthorized) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  await ensureSchema(env.DB);

  const config = normalizeConfigInput(body);
  const expression = normalizeString(body.snippet_expression);

  validateConfig(config);

  for (const [key, value] of Object.entries(config)) {
    await upsertConfig(env.DB, key, value);
  }

  if (expression) {
    validateExpression(expression);
    await upsertRule(env.DB, {
      id: DEFAULT_RULE_ID,
      description: "主规则",
      expression,
      enabled: true,
      priority: 100
    });
  }

  const next = await getEffectiveConfig(env);

  return jsonResponse({
    ok: true,
    config_source: next.config_source,
    snippet_expression: next.snippet_expression,
    snippet_rules: next.snippet_rules
  });
}

export function buildSnippetExpression(config) {
  if (config.snippet_expression) {
    return config.snippet_expression;
  }

  const hostname = normalizeString(config.protected_hostname);

  if (!hostname) {
    return "";
  }

  const hostExpression = `(http.host eq "${hostname}")`;
  const pathPrefix = normalizeString(config.protected_path_prefix);

  if (!pathPrefix) {
    return hostExpression;
  }

  return `(${hostExpression} and starts_with(http.request.uri.path, "${pathPrefix}"))`;
}

export function firstEnv(env, names) {
  for (const name of names) {
    const value = env[name];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

async function ensureSchema(db) {
  await executeD1Schema(db, `
    CREATE TABLE IF NOT EXISTS ${CONFIG_TABLE} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${RULES_TABLE} (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      expression TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 100,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function readStoredConfig(db) {
  const rows = await db.prepare(`SELECT key, value FROM ${CONFIG_TABLE}`).all();
  const config = {};

  for (const row of rows.results || []) {
    if (CONFIG_KEYS.has(row.key)) {
      config[row.key] = row.value;
    }
  }

  return config;
}

async function readRules(db) {
  const rows = await db
    .prepare(`SELECT id, description, expression, enabled, priority FROM ${RULES_TABLE} ORDER BY priority ASC, id ASC`)
    .all();

  return (rows.results || []).map((row) => ({
    id: String(row.id || ""),
    description: String(row.description || ""),
    expression: String(row.expression || ""),
    enabled: Number(row.enabled) === 1,
    priority: Number(row.priority || 100)
  }));
}

async function upsertConfig(db, key, value) {
  await db
    .prepare(`
      INSERT INTO ${CONFIG_TABLE} (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `)
    .bind(key, value)
    .run();
}

async function upsertRule(db, rule) {
  await db
    .prepare(`
      INSERT INTO ${RULES_TABLE} (id, description, expression, enabled, priority, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        description = excluded.description,
        expression = excluded.expression,
        enabled = excluded.enabled,
        priority = excluded.priority,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(rule.id, rule.description, rule.expression, rule.enabled ? 1 : 0, rule.priority)
    .run();
}

function readEnvConfig(env) {
  const protectedHostname = firstEnv(env, ["PROTECTED_HOSTNAME", "HOSTNAME"]);
  const protectedPathPrefix = firstEnv(env, ["PROTECTED_PATH_PREFIX", "PATH_PREFIX"]);
  const cloudflareZoneId = firstEnv(env, [
    "CLOUDFLARE_ZONE_ID",
    "CLOUDFLARE_ZONEID",
    "ZONE_ID",
    "ZONEID",
    "CF_ZONE_ID",
    "CF_ZONEID",
    "zoneid"
  ]);
  const cloudflareZoneName = firstEnv(env, ["CLOUDFLARE_ZONE_NAME", "ZONE_NAME"]);
  const snippetName = firstEnv(env, ["SNIPPET_NAME"]) || "edge_waf_gate";
  const snippetExpression = firstEnv(env, ["SNIPPET_EXPRESSION"]) || buildSnippetExpression({
    protected_hostname: protectedHostname,
    protected_path_prefix: protectedPathPrefix
  });

  return {
    protected_hostname: protectedHostname,
    protected_path_prefix: protectedPathPrefix,
    cloudflare_zone_id: cloudflareZoneId,
    cloudflare_zone_name: cloudflareZoneName,
    snippet_name: snippetName,
    snippet_expression: snippetExpression
  };
}

function normalizeConfigInput(body) {
  const config = {};

  for (const key of CONFIG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      config[key] = normalizeString(body[key]);
    }
  }

  if (!config.snippet_name) {
    config.snippet_name = "edge_waf_gate";
  }

  return config;
}

function buildRulesExpression(rules) {
  const expressions = rules
    .map((rule) => normalizeString(rule.expression))
    .filter(Boolean);

  if (expressions.length === 0) {
    return "";
  }

  if (expressions.length === 1) {
    return expressions[0];
  }

  return expressions.map((expression) => `(${expression})`).join(" or ");
}

function validateConfig(config) {
  if (config.protected_hostname && !/^[a-z0-9.-]+$/i.test(config.protected_hostname)) {
    throw new Error("PROTECTED_HOSTNAME is invalid");
  }

  if (config.protected_path_prefix && !config.protected_path_prefix.startsWith("/")) {
    throw new Error("PROTECTED_PATH_PREFIX must start with /");
  }

  if (config.snippet_name && !/^[a-z0-9_]+$/.test(config.snippet_name)) {
    throw new Error("SNIPPET_NAME can only contain lowercase letters, digits, and underscores");
  }
}

function validateExpression(expression) {
  if (expression.length > 4096) {
    throw new Error("SNIPPET_EXPRESSION is too long");
  }
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
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
