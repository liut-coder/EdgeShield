import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const DEFAULTS = {
  d1Database: "edge_waf_db",
  kvNamespace: "edge-waf-v0-kv"
};

const d1Database = process.env.D1_DATABASE?.trim() || DEFAULTS.d1Database;
const kvNamespace = process.env.KV_NAMESPACE?.trim() || DEFAULTS.kvNamespace;

const d1Id = await resolveD1DatabaseId(d1Database);
const kvId = await resolveKvNamespaceId(kvNamespace);
await generateWranglerConfig({ d1Database, d1Id, kvId });
await run(npxBin(), ["wrangler", "deploy", "--config", "wrangler.generated.toml", "--keep-vars"]);

async function resolveD1DatabaseId(databaseName) {
  const output = await run(npxBin(), ["wrangler", "d1", "list", "--json"], { capture: true });
  const databases = parseJsonArray(output);
  const match = databases.find((database) => database.name === databaseName);
  const id = match?.uuid || match?.database_id;

  if (!id) {
    throw new Error(`D1 database ${databaseName} was not found. Create it first, then bind it as DB.`);
  }

  return id;
}

async function resolveKvNamespaceId(namespaceTitle) {
  const output = await run(npxBin(), ["wrangler", "kv", "namespace", "list"], { capture: true });
  const namespaces = parseJsonArray(output);
  const match = namespaces.find((namespace) => namespace.title === namespaceTitle);

  return match?.id || "";
}

async function generateWranglerConfig({ d1Database, d1Id, kvId }) {
  let toml = await readFile("wrangler.toml", "utf8");
  const d1Config = `[[d1_databases]]\nbinding = "DB"\ndatabase_name = "${escapeTomlString(d1Database)}"\ndatabase_id = "${escapeTomlString(d1Id)}"`;

  toml = upsertBlock(toml, /\[\[d1_databases\]\][\s\S]*?(?=\n\[[^[\n]|\n\[\[|$)/m, d1Config);

  if (kvId) {
    const kvConfig = `kv_namespaces = [\n  { binding = "KV", id = "${escapeTomlString(kvId)}" }\n]`;
    toml = upsertBlock(toml, /kv_namespaces\s*=\s*\[[\s\S]*?\]/m, kvConfig);
  }

  await writeFile("wrangler.generated.toml", toml);
}

function parseJsonArray(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");

  if (start === -1 || end === -1 || end < start) {
    return [];
  }

  return JSON.parse(output.slice(start, end + 1));
}

function upsertBlock(source, pattern, block) {
  if (pattern.test(source)) {
    return source.replace(pattern, block);
  }

  return `${source.trimEnd()}\n\n${block}\n`;
}

function escapeTomlString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function run(command, args, { capture = false } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      shell: false,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
    });
    let stdout = "";
    let stderr = "";

    if (capture) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
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
