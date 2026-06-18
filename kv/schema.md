# KV Schema

Cloudflare KV is used as the MVP IP reputation store.

## Namespace

Binding name:

```toml
KV
```

## Keys

| Key | Value | Meaning |
| --- | --- | --- |
| `bad:<ip>` | `1` | IP is marked as bad and adds `+60` to the WAF score. |

Example:

```text
bad:203.0.113.10 = 1
```

## Reserved Future Keys

The MVP only reads `bad:<ip>`. Future versions can add trust-token and reputation keys without changing the Snippet contract.
