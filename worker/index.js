import { challengeHtml, checkScript } from "./challenge.js";
import { dashboardHtml, statusResponse } from "./dashboard.js";
import { installSnippet } from "./installer.js";
import { scoreRequest } from "./scoring.js";
import {
  getValidToken,
  hasValidToken,
  jsonResponse,
  parseDecisionInput
} from "./utils.js";

const DECISION_PATH = "/__edge-waf/decision";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(await dashboardHtml(request, env), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }

    if (request.method === "GET" && url.pathname === "/__edge-waf/status") {
      return await statusResponse(request, env);
    }

    if (request.method === "GET" && url.pathname === "/check.js") {
      return new Response(checkScript(), {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }

    if (request.method === "POST" && url.pathname === "/__edge-waf/install") {
      try {
        return await installSnippet(request, env);
      } catch (error) {
        return jsonResponse({ error: error.message || "install_failed" }, 500);
      }
    }

    if (request.method !== "POST" || url.pathname !== DECISION_PATH) {
      return jsonResponse({ error: "not_found" }, 404);
    }

    const input = await parseDecisionInput(request);
    const score = await scoreRequest(input, env);

    if (score >= 80) {
      return jsonResponse({ action: "block" });
    }

    if (hasValidToken(input.cookie, getValidToken(input.ip))) {
      return jsonResponse({ action: "allow" });
    }

    if (score >= 40) {
      return jsonResponse({
        action: "challenge",
        html: challengeHtml(input.ip)
      });
    }

    return jsonResponse({ action: "allow" });
  }
};
