# Edge WAF v0.1

Lightweight edge WAF MVP built on Cloudflare Snippets + Workers for bot filtering and challenge-based verification.

## Architecture

```text
Client
  |
  v
Cloudflare Snippets (Edge Gateway)
  |
  v
Cloudflare Worker (Decision Engine)
  |
  +-- allow -----> Origin
  |
  +-- challenge -> HTML challenge page -> inline JS -> __token cookie -> reload -> Origin
  |
  +-- block -----> 403
```

## Quick Start

Install dependencies:

```bash
npm install
```

Create a Cloudflare KV namespace, then replace `YOUR_KV_ID` in `wrangler.toml`.

Deploy the Worker:

```bash
npm run deploy
```

or:

```bash
wrangler deploy
```

Update `snippets/edge-gate.js`:

```js
const WAF_WORKER_URL = "https://edge-waf-v0-1.YOUR_SUBDOMAIN.workers.dev/__edge-waf/decision";
```

Deploy that file as a Cloudflare Snippet on the protected zone and attach a Snippet rule. The challenge page inlines the check script, and the Worker also serves `/check.js` directly for standalone testing.

For one-click Worker, KV, and Snippet deployment, use the GitHub Actions workflow below.

## GitHub One-Click Deploy

This repo includes a manual GitHub Actions workflow:

```text
.github/workflows/deploy-cloudflare.yml
```

GitHub cannot deploy into a Cloudflare account without authorization. Do this one-time setup in the GitHub repo:

1. Open `Settings -> Secrets and variables -> Actions`.
2. Add `CLOUDFLARE_API_TOKEN`.
3. Add `CLOUDFLARE_ACCOUNT_ID`.
4. Add `CLOUDFLARE_ZONE_ID`.
5. Open `Actions -> Deploy to Cloudflare -> Run workflow`.

The workflow will:

- install dependencies
- run syntax checks
- create or reuse the KV namespace
- generate a temporary Wrangler config with the real KV id
- deploy the Worker
- render `snippets/edge-gate.js` with the real workers.dev decision URL
- create or update the Cloudflare Snippet
- attach the Snippet rule to the target zone

Recommended API token permissions:

- Account `Workers Scripts:Edit`
- Account `Workers KV Storage:Edit`
- Account `Account Settings:Read`
- Zone `Snippets:Edit`

Workflow inputs:

| Input | Default | Notes |
| --- | --- | --- |
| `worker_name` | `edge-waf-v0-1` | Cloudflare Worker name. |
| `kv_namespace` | `edge-waf-v0-kv` | Created if missing. |
| `zone_id` | empty | Optional override for the `CLOUDFLARE_ZONE_ID` secret. |
| `snippet_name` | `edge_waf_gate` | Must use lowercase letters, digits, and underscores. |
| `snippet_expression` | `true` | Cloudflare expression for when the Snippet runs. Use a hostname expression such as `(http.host eq "www.example.com")` to scope it to one hostname. |

The default `snippet_expression` protects the entire zone. Change it before running the workflow if only one hostname or path should be protected.

## Modules

### snippets

`snippets/edge-gate.js` is the lightweight edge gateway:

- bypasses static assets
- forwards `CF-Connecting-IP`
- forwards `User-Agent`
- forwards request path
- calls the Worker for `allow`, `challenge`, or `block`

### worker

`worker/index.js` is the decision engine. It receives Snippet requests at `/__edge-waf/decision`, computes the score, checks the MVP challenge cookie, and returns:

```json
{
  "action": "allow | challenge | block",
  "html": "<optional>"
}
```

`worker/scoring.js` implements rule-based scoring:

```text
score = 0
if ua missing or too short  +40
if path contains /login     +10
if KV bad:<ip> exists       +60
```

In v0.1, "too short" means a trimmed `User-Agent` shorter than 8 characters.

Decision mapping:

| Score | Action |
| --- | --- |
| `0-39` | `allow` |
| `40-79` | `challenge` |
| `80+` | `block` |

`worker/challenge.js` returns the HTML challenge page with:

```html
<meta name="check" content="ip">
<script>/* inline check script */</script>
```

`worker/utils.js` contains input parsing, JSON response helpers, cookie parsing, and MVP token generation.

### public

The inline check script and `public/check.js` read the challenge meta IP, generate:

```text
base64(ip + ":v0")
```

Then it writes:

```text
__token=<token>
```

and reloads the page.

### kv

KV stores IP blacklist markers:

```text
bad:<ip> = 1
```

Configure the binding in `wrangler.toml`:

```toml
kv_namespaces = [
  { binding = "KV", id = "YOUR_KV_ID" }
]
```

## Status

v0.1 MVP.

Implemented scope:

- Cloudflare Snippet request entry filtering
- Cloudflare Worker decision core
- IP / UA / path rule-based scoring
- JS challenge with MVP base64 token cookie
- KV bad IP lookup

Reserved future extensions:

- rate limiting
- trust token
- bot scoring API
