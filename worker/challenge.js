export function challengeHtml(ip) {
  const escapedIp = escapeAttribute(ip);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="check" content="${escapedIp}">
  <title>Checking request</title>
</head>
<body>
  <script>${checkScript()}</script>
</body>
</html>`;
}

export function checkScript() {
  return `(() => {
  const meta = document.querySelector('meta[name="check"]');
  const ip = meta ? meta.getAttribute("content") : "";

  if (!ip) {
    return;
  }

  const token = btoa(ip + ":v0");

  if (readCookie("__token") === token) {
    return;
  }

  document.cookie = "__token=" + token + "; Path=/; Max-Age=600; SameSite=Lax";
  window.location.reload();

  function readCookie(name) {
    const prefix = name + "=";
    const parts = document.cookie ? document.cookie.split(";") : [];

    for (const part of parts) {
      const value = part.trim();

      if (value.startsWith(prefix)) {
        return value.slice(prefix.length);
      }
    }

    return "";
  }
})();`;
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
