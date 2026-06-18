# Edge WAF v0.1 Architecture

Edge WAF v0.1 is a minimal request filtering pipeline built on Cloudflare Snippets and a Cloudflare Worker.

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
  +-- challenge -> HTML challenge page -> inline JS -> __token cookie -> reload
  |
  +-- block -----> 403
```

## Components

### Snippet: Edge Gateway

`snippets/edge-gate.js` runs at the request entry point. It keeps CPU work low:

- bypasses static assets
- extracts `CF-Connecting-IP`
- extracts `User-Agent`
- forwards the request path
- sends the compact decision request to the Worker
- applies the returned action

The Snippet does not compute score, hash values, or query KV.

### Worker: Decision Engine

`worker/index.js` accepts decision requests at:

```text
/__edge-waf/decision
```

It computes a score using `worker/scoring.js`, checks the MVP token cookie, and returns:

```json
{
  "action": "allow | challenge | block",
  "html": "<optional>"
}
```

### KV

KV stores bad IP markers:

```text
bad:<ip> = 1
```

The Worker reads this key during scoring.

## Scoring

```text
score = 0
if ua missing or too short  +40
if path contains /login     +10
if KV bad:<ip> exists       +60
```

`too short` is defined as a trimmed `User-Agent` shorter than 8 characters in v0.1.

Decision mapping:

| Score | Action |
| --- | --- |
| `0-39` | `allow` |
| `40-79` | `challenge` |
| `80+` | `block` |

For a challenged request, a valid `__token` can allow the reload through unless the request still scores `80+`.

## Extension Points

Reserved v0.2 areas:

- rate limiting
- trust token
- bot scoring API
