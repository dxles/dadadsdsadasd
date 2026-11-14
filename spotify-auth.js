(() => {
  const storageKey = "cinla_spotify_oauth_token";
  const verifierKey = "cinla_spotify_pkce_verifier";
  const stateKey = "cinla_spotify_oauth_state";
  const redirectUri = `${location.origin}${location.pathname}`;

  const base64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  function randomString(size = 64) {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return base64url(bytes);
  }

  async function sha256(text) {
    return base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  }

  function getStoredToken() {
    try {
      const token = JSON.parse(localStorage.getItem(storageKey) || "null");
      return token && token.expiresAt > Date.now() + 30000 ? token : null;
    } catch { return null; }
  }

  async function connectSpotify() {
    const clientId = window.CINLA_CONFIG?.spotifyClientId;
    if (!clientId) throw new Error("Spotify OAuth Client ID henüz ayarlanmamış. integrations-config.js dosyasına Spotify Client ID eklenmeli.");
    const verifier = randomString(64);
    const state = randomString(24);
    sessionStorage.setItem(verifierKey, verifier);
    sessionStorage.setItem(stateKey, state);
    const challenge = await sha256(verifier);
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "playlist-read-private playlist-read-collaborative user-library-read",
      code_challenge_method: "S256",
      code_challenge: challenge,
      state,
    });
    location.href = `https://accounts.spotify.com/authorize?${params}`;
  }

  async function exchangeCode(code) {
    const verifier = sessionStorage.getItem(verifierKey);
    const expectedState = sessionStorage.getItem(stateKey);
    const params = new URLSearchParams(location.search);
    if (!verifier || params.get("state") !== expectedState) throw new Error("Spotify bağlantı doğrulaması başarısız oldu.");
    const body = new URLSearchParams({
      client_id: window.CINLA_CONFIG.spotifyClientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });
    const response = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error_description || "Spotify token alınamadı.");
    localStorage.setItem(storageKey, JSON.stringify({ accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 }));
    sessionStorage.setItem("cinla_spotify_just_connected", "1");
    sessionStorage.removeItem(verifierKey);
    sessionStorage.removeItem(stateKey);
  }

  async function refreshToken(token) {
    if (!token?.refreshToken) throw new Error("Spotify oturumunun süresi doldu. Yeniden bağlan.");
    const body = new URLSearchParams({ client_id: window.CINLA_CONFIG.spotifyClientId, grant_type: "refresh_token", refresh_token: token.refreshToken });
    const response = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error_description || "Spotify oturumu yenilenemedi.");
    const updated = { accessToken: data.access_token, refreshToken: data.refresh_token || token.refreshToken, expiresAt: Date.now() + data.expires_in * 1000 };
    localStorage.setItem(storageKey, JSON.stringify(updated));
    return updated.accessToken;
  }

  async function getSpotifyAccessToken() {
    let token;
    try { token = JSON.parse(localStorage.getItem(storageKey) || "null"); } catch { token = null; }
    if (!token) throw new Error("Spotify hesabını bağla.");
    if (token.expiresAt > Date.now() + 30000) return token.accessToken;
    return refreshToken(token);
  }

  async function spotifyFetch(url, retry = true) {
    const accessToken = await getSpotifyAccessToken();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 401 && retry) {
      const token = JSON.parse(localStorage.getItem(storageKey) || "null");
      const fresh = await refreshToken(token);
      return fetch(url, { headers: { Authorization: `Bearer ${fresh}` } });
    }
    return response;
  }

  const ready = (async () => {
    const params = new URLSearchParams(location.search);
    if (params.has("error")) throw new Error(`Spotify bağlantısı iptal edildi: ${params.get("error")}`);
    const code = params.get("code");
    if (code && params.has("state")) {
      await exchangeCode(code);
      history.replaceState({}, document.title, redirectUri);
    }
  })();

  window.CinlaSpotify = { connectSpotify, spotifyFetch, ready, isConnected: () => { try { return !!JSON.parse(localStorage.getItem(storageKey) || "null"); } catch { return false; } }, disconnect: () => localStorage.removeItem(storageKey) };
})();
