(() => {
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
})();
