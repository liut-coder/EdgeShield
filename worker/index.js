import { challengeHtml, checkScript } from "./challenge.js";
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

    if (request.method === "GET" && url.pathname === "/check.js") {
      return new Response(checkScript(), {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "no-store"
        }
      });
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
