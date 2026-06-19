import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULTS = {
  workerName: "edge-waf-v0-1",
  d1Database: "edge-waf-v0-db",
  kvNamespace: "edge-waf-v0-kv",
  snippetName: "edge_waf_gate"
};

const protectedHostname = firstEnv("PROTECTED_HOSTNAME", "HOSTNAME");
const protectedPathPrefix = firstEnv("PROTECTED_PATH_PREFIX", "PATH_PREFIX");

const config = {
  workerName: process.env.WORKER_NAME || DEFAULTS.workerName,
  d1Database: process.env.D1_DATABASE || DEFAULTS.d1Database,
  kvNamespace: process.env.KV_NAMESPACE || DEFAULTS.kvNamespace,
  snippetName: process.env.SNIPPET_NAME || DEFAULTS.snippetName,
  snippetExpression: process.env.SNIPPET_EXPRESSION || buildSnippetExpression(protectedHostname, protectedPathPrefix),
  protectedHostname,
  protectedPathPrefix,
  cloudflareAccountId: firstEnv("CLOUDFLARE_ACCOUNT_ID", "ACCOUNT_ID", "CF_ACCOUNT_ID"),
  cloudflareAccountName: firstEnv("CLOUDFLARE_ACCOUNT_NAME", "ACCOUNT_NAME"),
  cloudflareApiToken: firstEnv("CLOUDFLARE_API_TOKEN"),
  cloudflareZoneId: firstEnv(
    "CLOUDFLARE_ZONE_ID",
    "CLOUDFLARE_ZONEID",
    "ZONE_ID",
    "ZONEID",
    "CF_ZONE_ID",
    "CF_ZONEID",
    "zoneid"
  ),
  cloudflareZoneName: firstEnv("CLOUDFLARE_ZONE_NAME", "ZONE_NAME")
};

if (!config.snippetExpression.trim()) {
  validateWorkerOnlyConfig(config);
  await deployWorkerOnly();
  console.log("");
  console.log("Worker deployed in runtime variable mode.");
  console.log("Next step: open the Worker dashboard or call POST /__edge-waf/install with x-api-token.");
  process.exit(0);
}

validateConfig(config);
config.cloudflareApiToken = requiredValue(config.cloudflareApiToken, "CLOUDFLARE_API_TOKEN");
config.cloudflareAccountId = await resolveAccountId(config);
config.cloudflareZoneId = await resolveZoneId(config);

const d1Id = await createOrReuseD1Database(config.d1Database);
const kvId = await createOrReuseKvNamespace(config.kvNamespace);
await generateWranglerConfig({ workerName: config.workerName, d1Database: config.d1Database, d1Id, kvId });
const workerUrl = await deployWorker();
await renderSnippet(`${workerUrl}/__edge-waf/decision`);
await deploySnippet(config);

console.log("");
console.log("Edge WAF deployment complete");
console.log(`Account id: ${config.cloudflareAccountId}`);
console.log(`Worker: ${config.workerName}`);
console.log(`Worker URL: ${workerUrl}`);
console.log(`D1 database: ${config.d1Database}`);
console.log(`D1 id: ${d1Id}`);
console.log(`KV namespace: ${config.kvNamespace}`);
console.log(`KV id: ${kvId}`);
console.log(`Snippet: ${config.snippetName}`);
console.log(`Snippet expression: ${config.snippetExpression}`);

function requiredValue(value, name) {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function firstEnv(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return "";
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

function validateConfig({
  workerName,
  kvNamespace,
  snippetName,
  snippetExpression,
  protectedHostname,
  protectedPathPrefix,
  cloudflareAccountId,
  cloudflareAccountName,
  cloudflareZoneId,
  cloudflareZoneName
}) {
  validateWorkerOnlyConfig({ workerName, kvNamespace, snippetName, d1Database: config.d1Database });

  if (!cloudflareApiToken) {
    throw new Error("CLOUDFLARE_API_TOKEN is required for build-time Snippet deployment");
  }

  if (!snippetExpression.trim()) {
    throw new Error("Set PROTECTED_HOSTNAME or SNIPPET_EXPRESSION so the Snippet rule has a protection scope");
  }

  validateProtectionConfig({ protectedHostname, protectedPathPrefix });

  if (cloudflareAccountId && !/^[0-9a-f]{32}$/i.test(cloudflareAccountId)) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID must be a 32-character hex account id");
  }

  if (cloudflareAccountName && !/^[\w .:@-]{1,120}$/.test(cloudflareAccountName)) {
    throw new Error("CLOUDFLARE_ACCOUNT_NAME contains unsupported characters");
  }

  if (cloudflareZoneId && !/^[0-9a-f]{32}$/i.test(cloudflareZoneId)) {
    throw new Error("CLOUDFLARE_ZONE_ID must be a 32-character hex zone id");
  }

  if (!cloudflareZoneId && !cloudflareZoneName && !protectedHostname) {
    const detectedNames = relevantEnvNames();
    throw new Error(
      `A Cloudflare zone is required for Snippet deployment. Set PROTECTED_HOSTNAME, CLOUDFLARE_ZONE_NAME, or CLOUDFLARE_ZONE_ID as build/deploy variables, not Worker runtime variables. Detected related env names: ${detectedNames || "none"}.`
    );
  }

  if (cloudflareZoneName && !/^[A-Za-z0-9.-]+$/.test(cloudflareZoneName)) {
    throw new Error("CLOUDFLARE_ZONE_NAME must be a domain name such as example.com");
  }
}

function validateWorkerOnlyConfig({ workerName, kvNamespace, snippetName, d1Database = DEFAULTS.d1Database }) {
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(workerName)) {
    throw new Error("WORKER_NAME must use lowercase letters, digits, and hyphens, max 63 chars");
  }

  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(kvNamespace)) {
    throw new Error("KV_NAMESPACE must use letters, digits, dot, underscore, colon, or hyphen");
  }

  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(d1Database)) {
    throw new Error("D1_DATABASE must use letters, digits, dot, underscore, colon, or hyphen");
  }

  if (!/^[a-z0-9_]+$/.test(snippetName)) {
    throw new Error("SNIPPET_NAME must use lowercase letters, digits, and underscores");
  }
}

function validateProtectionConfig({ protectedHostname, protectedPathPrefix }) {
  if (protectedHostname && !/^[A-Za-z0-9.-]+$/.test(protectedHostname)) {
    throw new Error("PROTECTED_HOSTNAME must be a hostname such as www.example.com");
  }

  if (protectedPathPrefix && !/^\/[A-Za-z0-9._~!$&'()*+,;=:@/-]*$/.test(protectedPathPrefix)) {
    throw new Error("PROTECTED_PATH_PREFIX must start with / and must not contain quotes or spaces");
  }
}

function relevantEnvNames() {
  return Object.keys(process.env)
    .filter((name) => /zone|host|snippet/i.test(name))
    .sort()
    .join(", ");
}

async function resolveAccountId({ cloudflareAccountId, cloudflareAccountName, cloudflareApiToken }) {
  if (cloudflareAccountId) {
    return cloudflareAccountId;
  }

  const params = new URLSearchParams({ per_page: "50" });
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts?${params}`, {
    headers: {
      authorization: `Bearer ${cloudflareApiToken}`,
      accept: "application/json"
    }
  });
  const text = await response.text();
  const body = parseJson(text);

  if (!response.ok || body?.success === false) {
    throw new Error(`Could not resolve Cloudflare account: ${formatApiError(body, text)}`);
  }

  const accounts = Array.isArray(body?.result) ? body.result : [];

  if (cloudflareAccountName) {
    const match = accounts.find((account) => account.name === cloudflareAccountName);

    if (!match?.id) {
      throw new Error(`Cloudflare account not found: ${cloudflareAccountName}`);
    }

    return match.id;
  }

  if (accounts.length === 1 && accounts[0]?.id) {
    return accounts[0].id;
  }

  if (accounts.length > 1) {
    const names = accounts.map((account) => account.name || account.id).join(", ");
    throw new Error(
      `CLOUDFLARE_ACCOUNT_ID is required because the token can access multiple accounts: ${names}. Set CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_ACCOUNT_NAME.`
    );
  }

  throw new Error("No Cloudflare accounts are accessible with the provided API token");
}

async function resolveZoneId({ cloudflareZoneId, cloudflareZoneName, cloudflareAccountId, cloudflareApiToken }) {
  if (cloudflareZoneId) {
    return cloudflareZoneId;
  }

  if (!cloudflareZoneName && config.protectedHostname) {
    return await resolveZoneIdFromHostname({
      protectedHostname: config.protectedHostname,
      cloudflareAccountId,
      cloudflareApiToken
    });
  }

  const params = new URLSearchParams({
    name: cloudflareZoneName,
    "account.id": cloudflareAccountId,
    per_page: "1"
  });
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones?${params}`, {
    headers: {
      authorization: `Bearer ${cloudflareApiToken}`,
      accept: "application/json"
    }
  });
  const text = await response.text();
  const body = parseJson(text);

  if (!response.ok || body?.success === false) {
    throw new Error(`Could not resolve Cloudflare zone ${cloudflareZoneName}: ${formatApiError(body, text)}`);
  }

  const zoneId = body?.result?.[0]?.id;

  if (!zoneId) {
    throw new Error(`Cloudflare zone not found: ${cloudflareZoneName}`);
  }

  return zoneId;
}

async function resolveZoneIdFromHostname({ protectedHostname, cloudflareAccountId, cloudflareApiToken }) {
  const params = new URLSearchParams({
    "account.id": cloudflareAccountId,
    per_page: "50"
  });
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones?${params}`, {
    headers: {
      authorization: `Bearer ${cloudflareApiToken}`,
      accept: "application/json"
    }
  });
  const text = await response.text();
  const body = parseJson(text);

  if (!response.ok || body?.success === false) {
    throw new Error(`Could not list Cloudflare zones: ${formatApiError(body, text)}`);
  }

  const hostname = protectedHostname.toLowerCase();
  const zones = Array.isArray(body?.result) ? body.result : [];
  const matches = zones
    .filter((zone) => hostname === zone.name || hostname.endsWith(`.${zone.name}`))
    .sort((a, b) => b.name.length - a.name.length);
  const match = matches[0];

  if (!match?.id) {
    throw new Error(
      `Could not find a Cloudflare zone matching PROTECTED_HOSTNAME=${protectedHostname}. Set CLOUDFLARE_ZONE_ID or CLOUDFLARE_ZONE_NAME explicitly.`
    );
  }

  console.log(`Resolved zone ${match.name} from PROTECTED_HOSTNAME=${protectedHostname}`);
  return match.id;
}

async function createOrReuseKvNamespace(namespaceTitle) {
  const namespacesOutput = await run(npxBin(), ["wrangler", "kv", "namespace", "list"], {
    capture: true,
    env: cloudflareEnv()
  });
  const namespaces = parseWranglerJsonArray(namespacesOutput);
  const existing = namespaces.find((namespace) => namespace.title === namespaceTitle);

  if (existing?.id) {
    return existing.id;
  }

  const createOutput = await run(npxBin(), ["wrangler", "kv", "namespace", "create", namespaceTitle], {
    capture: true,
    env: cloudflareEnv()
  });
  const kvId = parseKvId(createOutput);

  if (!kvId) {
    throw new Error("Could not resolve KV namespace id from Wrangler output");
  }

  return kvId;
}

async function createOrReuseD1Database(databaseName) {
  const databasesOutput = await run(npxBin(), ["wrangler", "d1", "list"], {
    capture: true,
    env: cloudflareEnv()
  });
  const databases = parseWranglerJsonArray(databasesOutput);
  const existing = databases.find((database) => database.name === databaseName);

  if (existing?.uuid || existing?.database_id) {
    return existing.uuid || existing.database_id;
  }

  const createOutput = await run(npxBin(), ["wrangler", "d1", "create", databaseName], {
    capture: true,
    env: cloudflareEnv()
  });
  const d1Id = parseD1Id(createOutput);

  if (!d1Id) {
    throw new Error("Could not resolve D1 database id from Wrangler output");
  }

  return d1Id;
}

async function generateWranglerConfig({ workerName, d1Database, d1Id, kvId }) {
  let toml = await readFile("wrangler.toml", "utf8");
  const d1Config = `[[d1_databases]]\nbinding = "DB"\ndatabase_name = "${d1Database}"\ndatabase_id = "${d1Id}"`;
  const kvConfig = `kv_namespaces = [\n  { binding = "KV", id = "${kvId}" }\n]`;

  toml = toml.replace(/^name\s*=\s*"[^"]*"/m, `name = "${workerName}"`);

  if (/\[\[d1_databases\]\][\s\S]*?(?=\n\[[^[\n]|\n\[\[|$)/m.test(toml)) {
    toml = toml.replace(/\[\[d1_databases\]\][\s\S]*?(?=\n\[[^[\n]|\n\[\[|$)/m, d1Config);
  } else {
    toml = `${toml.trimEnd()}\n\n${d1Config}\n`;
  }

  if (/kv_namespaces\s*=\s*\[[\s\S]*?\]/m.test(toml)) {
    toml = toml.replace(/kv_namespaces\s*=\s*\[[\s\S]*?\]/m, kvConfig);
  } else {
    toml = `${toml.trimEnd()}\n\n${kvConfig}\n`;
  }

  await writeFile("wrangler.generated.toml", toml);
}

async function deployWorker() {
  const output = await run(npxBin(), ["wrangler", "deploy", "--config", "wrangler.generated.toml"], {
    capture: true,
    env: cloudflareEnv()
  });
  const matches = [...output.matchAll(/https:\/\/[a-zA-Z0-9.-]+\.workers\.dev/g)].map((match) => match[0]);
  const workerUrl = matches.at(-1);

  if (!workerUrl) {
    throw new Error("Could not find workers.dev URL in Wrangler deploy output");
  }

  return workerUrl;
}

async function deployWorkerOnly() {
  await run(npxBin(), ["wrangler", "deploy", "--config", "wrangler.toml"]);
}

function cloudflareEnv(extra = {}) {
  return {
    ...process.env,
    CLOUDFLARE_API_TOKEN: config.cloudflareApiToken,
    CLOUDFLARE_ACCOUNT_ID: config.cloudflareAccountId,
    ...extra
  };
}

async function renderSnippet(decisionUrl) {
  const sourcePath = path.join("snippets", "edge-gate.js");
  const outputDir = ".generated";
  const outputPath = path.join(outputDir, "edge-gate.js");
  const source = await readFile(sourcePath, "utf8");
  const rendered = source.replace(
    /^const WAF_WORKER_URL = .*;$/m,
    `const WAF_WORKER_URL = ${JSON.stringify(decisionUrl)};`
  );

  if (rendered === source) {
    throw new Error("Could not replace WAF_WORKER_URL in snippets/edge-gate.js");
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, rendered);
}

async function deploySnippet({ cloudflareApiToken, cloudflareZoneId, snippetName, snippetExpression }) {
  await run(nodeBin(), ["scripts/deploy-snippet.mjs"], {
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: cloudflareApiToken,
      CLOUDFLARE_ZONE_ID: cloudflareZoneId,
      SNIPPET_NAME: snippetName,
      SNIPPET_EXPRESSION: snippetExpression,
      SNIPPET_FILE: ".generated/edge-gate.js",
      SNIPPET_MAIN_MODULE: "edge-gate.js",
      SNIPPET_DESCRIPTION: "Edge WAF gateway"
    }
  });
}

function parseWranglerJsonArray(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");

  if (start === -1 || end === -1 || end < start) {
    return [];
  }

  return JSON.parse(output.slice(start, end + 1));
}

function parseKvId(output) {
  const match = output.match(/id\s*=\s*"([^"]+)"/) || output.match(/"id"\s*:\s*"([^"]+)"/);
  return match?.[1] || "";
}

function parseD1Id(output) {
  const match =
    output.match(/database_id\s*=\s*"([^"]+)"/) ||
    output.match(/"database_id"\s*:\s*"([^"]+)"/) ||
    output.match(/"uuid"\s*:\s*"([^"]+)"/);

  return match?.[1] || "";
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

async function run(command, args, { capture = false, env = process.env } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      shell: false,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
    });
    let stdout = "";
    let stderr = "";

    if (capture) {
      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        process.stdout.write(text);
      });
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        process.stderr.write(text);
      });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(`${stdout}${stderr}`);
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

function npxBin() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function nodeBin() {
  return process.execPath;
}
