export async function parseDecisionInput(request) {
  const body = await request.json();

  return {
    ip: normalize(body.ip),
    ua: normalize(body.ua),
    path: normalizePath(body.path),
    cookie: normalize(body.cookie)
  };
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export function getValidToken(ip) {
  const normalizedIp = normalize(ip);

  if (!normalizedIp) {
    return "";
  }

  return base64(`${normalizedIp}:v0`);
}

export function hasValidToken(cookieHeader, expectedToken) {
  if (!expectedToken) {
    return false;
  }

  return readCookie(cookieHeader, "__token") === expectedToken;
}

function readCookie(cookieHeader, name) {
  const prefix = `${name}=`;
  const parts = cookieHeader ? cookieHeader.split(";") : [];

  for (const part of parts) {
    const value = part.trim();

    if (value.startsWith(prefix)) {
      return value.slice(prefix.length);
    }
  }

  return "";
}

function normalize(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePath(value) {
  const path = normalize(value);
  return path.startsWith("/") ? path : "/";
}

function base64(value) {
  if (typeof btoa === "function") {
    return btoa(value);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64");
  }

  throw new Error("No base64 encoder is available");
}
