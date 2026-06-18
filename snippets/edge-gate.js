const WAF_WORKER_URL = "https://edge-waf-v0-1.YOUR_SUBDOMAIN.workers.dev/__edge-waf/decision";

const STATIC_PATHS = new Set([
  "/check.js",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml"
]);

const STATIC_EXTENSION_RE = /\.(?:css|js|mjs|png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|map|txt|xml|pdf)$/i;

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
