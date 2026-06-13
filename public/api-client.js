(function () {
  const apiBaseKey = "vr-api-base";

  function cleanApiBase(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    try {
      const url = new URL(raw, window.location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      return url.origin + url.pathname.replace(/\/$/, "");
    } catch {
      return "";
    }
  }

  const params = new URLSearchParams(window.location.search);
  const queryApiBase = cleanApiBase(params.get("api"));
  if (queryApiBase) {
    localStorage.setItem(apiBaseKey, queryApiBase);
  }

  function apiBase() {
    return cleanApiBase(localStorage.getItem(apiBaseKey));
  }

  function apiUrl(path) {
    return `${apiBase()}${path}`;
  }

  function connectionMessage() {
    const base = apiBase();
    if (base) {
      return `Impossible de joindre le serveur ${base}. Verifie son adresse.`;
    }

    if (window.location.protocol === "file:") {
      return "Tu as ouvert le fichier sans serveur. Lance le serveur puis ouvre l'adresse http://localhost:3000.";
    }

    if (window.location.hostname.endsWith("github.io")) {
      return "Cette page GitHub n'est pas connectee au serveur de reservations. Ouvre l'adresse affichee par le serveur Node.";
    }

    return "Impossible de joindre le serveur de reservations. Verifie qu'il est lance.";
  }

  window.vrApi = {
    base: apiBase,
    clearBase() {
      localStorage.removeItem(apiBaseKey);
    },
    fetch(path, options) {
      return fetch(apiUrl(path), options);
    },
    message: connectionMessage,
  };
})();
