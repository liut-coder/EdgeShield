const USERS_TABLE = "edge_waf_users";
const SESSIONS_TABLE = "edge_waf_sessions";
const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const SESSION_COOKIE = "edge_waf_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const PBKDF2_ITERATIONS = 100000;

export async function getAuthState(request, env) {
  if (!env.DB) {
    return {
      available: false,
      has_users: false,
      user: null
    };
  }

  await ensureAuthSchema(env.DB);

  return {
    available: true,
    has_users: await hasUsers(env.DB),
    user: await readSessionUser(request, env.DB)
  };
}

export async function setupAdminResponse(request, env) {
  if (!env.DB) {
    return jsonResponse({ error: "D1 binding DB is required" }, 400);
  }

  if (!await isSetupAuthorized(request, env)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  await ensureAuthSchema(env.DB);

  if (await hasUsers(env.DB)) {
    return jsonResponse({ error: "admin_already_exists" }, 409);
  }

  const body = await request.json().catch(() => null);
  const username = normalizeUsername(body?.username);
  const password = normalizePassword(body?.password);

  validateCredentials(username, password);

  await env.DB
    .prepare(`
      INSERT INTO ${USERS_TABLE} (id, username, password_hash, role, created_at)
      VALUES (?, ?, ?, 'admin', CURRENT_TIMESTAMP)
    `)
    .bind(crypto.randomUUID(), username, await hashPassword(password))
    .run();

  return jsonResponse({ ok: true });
}

export async function isSetupAuthorized(request, env) {
  const token = request.headers.get("x-api-token") || "";

  if (env.CLOUDFLARE_API_TOKEN && token === env.CLOUDFLARE_API_TOKEN) {
    return true;
  }

  if (!env.DB || !token) {
    return false;
  }

  await ensureAuthSchema(env.DB);

  if (await hasUsers(env.DB)) {
    return false;
  }

  return await verifyCloudflareApiToken(token);
}

export async function loginResponse(request, env) {
  if (!env.DB) {
    return jsonResponse({ error: "D1 binding DB is required" }, 400);
  }

  await ensureAuthSchema(env.DB);

  const body = await request.json().catch(() => null);
  const username = normalizeUsername(body?.username);
  const password = normalizePassword(body?.password);
  const user = await env.DB
    .prepare(`SELECT id, username, password_hash, role FROM ${USERS_TABLE} WHERE username = ?`)
    .bind(username)
    .first();

  if (!user || !await verifyPassword(password, user.password_hash)) {
    return jsonResponse({ error: "invalid_credentials" }, 401);
  }

  const sessionId = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  await env.DB
    .prepare(`
      INSERT INTO ${SESSIONS_TABLE} (id, user_id, expires_at, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `)
    .bind(sessionId, user.id, expiresAt)
    .run();

  return jsonResponse({
    ok: true,
    user: {
      username: user.username,
      role: user.role
    }
  }, 200, {
    "set-cookie": serializeSessionCookie(sessionId, SESSION_TTL_SECONDS)
  });
}

export async function logoutResponse(request, env) {
  const sessionId = readCookie(request, SESSION_COOKIE);

  if (env.DB && sessionId) {
    await ensureAuthSchema(env.DB);
    await env.DB.prepare(`DELETE FROM ${SESSIONS_TABLE} WHERE id = ?`).bind(sessionId).run();
  }

  return jsonResponse({ ok: true }, 200, {
    "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  });
}

async function ensureAuthSchema(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ${USERS_TABLE} (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${SESSIONS_TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_edge_waf_sessions_user ON ${SESSIONS_TABLE}(user_id);
    CREATE INDEX IF NOT EXISTS idx_edge_waf_sessions_expires ON ${SESSIONS_TABLE}(expires_at);
  `);
}

async function hasUsers(db) {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${USERS_TABLE}`).first();
  return Number(row?.count || 0) > 0;
}

async function readSessionUser(request, db) {
  const sessionId = readCookie(request, SESSION_COOKIE);

  if (!sessionId) {
    return null;
  }

  const row = await db
    .prepare(`
      SELECT users.id, users.username, users.role
      FROM ${SESSIONS_TABLE} sessions
      JOIN ${USERS_TABLE} users ON users.id = sessions.user_id
      WHERE sessions.id = ? AND sessions.expires_at > ?
    `)
    .bind(sessionId, new Date().toISOString())
    .first();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    role: row.role
  };
}

function validateCredentials(username, password) {
  if (!/^[a-zA-Z0-9_.@-]{3,64}$/.test(username)) {
    throw new Error("Username must be 3-64 characters");
  }

  if (password.length < 10 || password.length > 128) {
    throw new Error("Password must be 10-128 characters");
  }
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt,
    iterations: PBKDF2_ITERATIONS
  }, key, 256);

  return `pbkdf2:${PBKDF2_ITERATIONS}:${base64Url(salt)}:${base64Url(new Uint8Array(bits))}`;
}

async function verifyPassword(password, storedHash) {
  const parts = String(storedHash || "").split(":");

  if (parts.length !== 4 || parts[0] !== "pbkdf2") {
    return false;
  }

  const iterations = Number(parts[1]);
  const salt = base64UrlDecode(parts[2]);
  const expected = base64UrlDecode(parts[3]);
  const key = await crypto.subtle.importKey("raw", encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt,
    iterations
  }, key, expected.length * 8);

  return timingSafeEqual(new Uint8Array(bits), expected);
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }

  return diff === 0;
}

function readCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const prefix = `${name}=`;
  const part = cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix));

  return part ? decodeURIComponent(part.slice(prefix.length)) : "";
}

function serializeSessionCookie(sessionId, maxAge) {
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export async function verifyCloudflareApiToken(token) {
  const response = await fetch(`${CLOUDFLARE_API_BASE}/user/tokens/verify`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json"
    }
  });
  const body = await response.json().catch(() => null);

  return response.ok && body?.success === true;
}

function randomToken() {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function encode(value) {
  return new TextEncoder().encode(value);
}

function base64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function normalizeUsername(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePassword(value) {
  return typeof value === "string" ? value : "";
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}
