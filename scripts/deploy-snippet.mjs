import { readFile } from "node:fs/promises";
import path from "node:path";

const API_BASE = "https://api.cloudflare.com/client/v4";

const config = {
  token: requiredEnv("CLOUDFLARE_API_TOKEN"),
  zoneId: requiredEnv("CLOUDFLARE_ZONE_ID"),
  snippetName: requiredEnv("SNIPPET_NAME"),
  snippetFile: requiredEnv("SNIPPET_FILE"),
  mainModule: process.env.SNIPPET_MAIN_MODULE || path.basename(requiredEnv("SNIPPET_FILE")),
  expression: requiredEnv("SNIPPET_EXPRESSION"),
  description: process.env.SNIPPET_DESCRIPTION || "Edge WAF gateway"
};

validateConfig(config);

await uploadSnippet(config);
await upsertSnippetRule(config);

console.log(`Snippet ${config.snippetName} deployed and attached.`);

function requiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function validateConfig({ zoneId, snippetName, snippetFile, mainModule, expression }) {
  if (!/^[0-9a-f]{32}$/i.test(zoneId)) {
    throw new Error("CLOUDFLARE_ZONE_ID must be a 32-character hex zone id");
  }

  if (!/^[a-z0-9_]+$/.test(snippetName)) {
    throw new Error("SNIPPET_NAME can only contain lowercase letters, digits, and underscores");
  }

  if (!snippetFile.endsWith(".js") || !mainModule.endsWith(".js")) {
    throw new Error("SNIPPET_FILE and SNIPPET_MAIN_MODULE must be JavaScript files");
  }

  if (!expression.trim()) {
    throw new Error("SNIPPET_EXPRESSION must not be empty");
  }
}

async function uploadSnippet({ zoneId, snippetName, snippetFile, mainModule }) {
  const source = await readFile(snippetFile);
  const form = new FormData();

  form.append("files", new Blob([source], { type: "application/javascript" }), mainModule);
  form.append("metadata", JSON.stringify({ main_module: mainModule }));

  await cloudflareFetch(`/zones/${zoneId}/snippets/${snippetName}`, {
    method: "PUT",
    body: form
  });
}

async function upsertSnippetRule({ zoneId, snippetName, expression, description }) {
  const existing = await cloudflareFetch(`/zones/${zoneId}/snippets/snippet_rules`, {
    allowNotFound: true
  });

  const rules = normalizeRules(existing);
  const preservedRules = rules.filter((rule) => rule.snippet_name !== snippetName);

  preservedRules.push({
    description,
    enabled: true,
    expression,
    snippet_name: snippetName
  });

  await cloudflareFetch(`/zones/${zoneId}/snippets/snippet_rules`, {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ rules: preservedRules })
  });
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

async function cloudflareFetch(apiPath, { allowNotFound = false, headers = {}, ...options } = {}) {
  const response = await fetch(`${API_BASE}${apiPath}`, {
    ...options,
    headers: {
      authorization: `Bearer ${config.token}`,
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
    const detail = formatApiError(body, text);
    throw new Error(`Cloudflare API ${response.status} ${response.statusText}: ${detail}`);
  }

  return body?.result ?? body;
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
