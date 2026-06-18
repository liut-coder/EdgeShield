const MIN_UA_LENGTH = 8;

export async function scoreRequest(input, env) {
  let score = 0;
  const ua = normalize(input.ua);
  const path = normalize(input.path).toLowerCase();

  if (!ua || ua.length < MIN_UA_LENGTH) {
    score += 40;
  }

  if (path.includes("/login")) {
    score += 10;
  }

  if (input.ip && env?.KV && await isBadIp(input.ip, env.KV)) {
    score += 60;
  }

  return score;
}

async function isBadIp(ip, kv) {
  const value = await kv.get(`bad:${ip}`);
  return value === "1";
}

function normalize(value) {
  return typeof value === "string" ? value.trim() : "";
}
