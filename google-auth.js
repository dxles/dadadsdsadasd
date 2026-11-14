(() => {
  const tokenKey = "cinla_google_oauth_token";
  let tokenClient = null;
  let scriptReady;
  let tokenResolve = null;
  let tokenReject = null;

  function loadGoogleIdentity() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (scriptReady) return scriptReady;
    scriptReady = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Google giriş bileşeni yüklenemedi."));
      document.head.appendChild(script);
    });
    return scriptReady;
  }

  function readToken() {
    try {
      const saved = JSON.parse(localStorage.getItem(tokenKey) || "null");
      return saved && saved.expiresAt > Date.now() + 30000 ? saved.accessToken : "";
    } catch { return ""; }
  }

  async function getGoogleAccessToken(forcePrompt = false) {
    if (!forcePrompt) {
      const cached = readToken();
      if (cached) return cached;
    }
    const clientId = window.CINLA_CONFIG?.googleClientId;
    if (!clientId) throw new Error("Google OAuth istemci kimliği henüz ayarlanmamış. integrations-config.js dosyasına Google Web Client ID eklenmeli.");
    await loadGoogleIdentity();
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/youtube.readonly",
        callback: (response) => {
          if (response.error) { tokenReject?.(new Error(response.error_description || response.error)); return; }
          localStorage.setItem(tokenKey, JSON.stringify({ accessToken: response.access_token, expiresAt: Date.now() + response.expires_in * 1000 }));
          tokenResolve?.(response.access_token);
          tokenResolve = tokenReject = null;
        },
      });
    }
    return new Promise((resolve, reject) => {
      tokenResolve = resolve;
      tokenReject = reject;
      tokenClient.requestAccessToken({ prompt: forcePrompt ? "consent" : "" });
    });
  }

  async function youtubeFetch(url, retry = true) {
    const token = await getGoogleAccessToken(false);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401 && retry) {
      localStorage.removeItem(tokenKey);
      const fresh = await getGoogleAccessToken(true);
      return fetch(url, { headers: { Authorization: `Bearer ${fresh}` } });
    }
    return response;
  }

  function disconnectGoogle() { localStorage.removeItem(tokenKey); }

  loadGoogleIdentity().catch(() => {});
  window.CinlaGoogle = { getGoogleAccessToken, youtubeFetch, disconnectGoogle, isConnected: () => !!readToken() };
})();
