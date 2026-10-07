// ---- Ortak depolama anahtarları ----
const STORAGE_KEYS = {
  apiKey: "cinla_yt_api_key",
  userSongs: "cinla_user_songs",
  cachedSongs: "cinla_cached_songs",
  queue: "cinla_queue",
  queueMeta: "cinla_queue_meta",
  playlists: "cinla_playlists",
  nowPlaying: "cinla_now_playing",
  lyricsStyle: "cinla_lyrics_style",
  lyricsFallback: "cinla_lyrics_fallback",
  lyricsProviders: "cinla_lyrics_providers",
  playerLayout: "cinla_player_layout",
};

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// YouTube API başlıkları bazen "&amp;" gibi HTML entity kaçışlı gelir.
// Bunu ham metne çevirip tekrar (çift) kaçışı önlemek için kullan.
function decodeHtmlEntities(str) {
  const div = document.createElement("div");
  div.innerHTML = str || "";
  return div.textContent || "";
}

// ---- YouTube API anahtarı ----
function getApiKey() {
  return localStorage.getItem(STORAGE_KEYS.apiKey) || "";
}

function setApiKey(key) {
  localStorage.setItem(STORAGE_KEYS.apiKey, key || "");
}

// ---- Kullanıcının kendi eklediği şarkılar ----
function getUserSongs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.userSongs) || "[]");
  } catch {
    return [];
  }
}

function saveUserSong(song) {
  const songs = getUserSongs();
  if (songs.some(s => s.id === song.id)) return;
  songs.unshift(song);
  localStorage.setItem(STORAGE_KEYS.userSongs, JSON.stringify(songs));
}

// ---- YouTube önbelleği ----
function getCachedSongs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.cachedSongs) || "null");
  } catch {
    return null;
  }
}

function setCachedSongs(songs) {
  localStorage.setItem(STORAGE_KEYS.cachedSongs, JSON.stringify(songs));
}

// ---- Çalma sırası (o an ekranda görünen liste) ----
function saveQueue(songs, contextLabel) {
  try {
    const queue = songs.map(s => ({ id: s.id, title: s.title, channel: s.channel || "" }));
    localStorage.setItem(STORAGE_KEYS.queue, JSON.stringify(queue));
    if (contextLabel) localStorage.setItem(STORAGE_KEYS.queueMeta, contextLabel);
  } catch {
    /* sessiz geç */
  }
}

function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.queue) || "[]");
  } catch {
    return [];
  }
}

// ---- Çalma listeleri ----
function getPlaylists() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.playlists) || "[]");
  } catch {
    return [];
  }
}

function savePlaylists(playlists) {
  localStorage.setItem(STORAGE_KEYS.playlists, JSON.stringify(playlists));
}

function createPlaylist(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  const playlists = getPlaylists();
  const playlist = {
    id: "pl_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: trimmed,
    songs: [],
  };
  playlists.push(playlist);
  savePlaylists(playlists);
  return playlist;
}

function deletePlaylist(id) {
  savePlaylists(getPlaylists().filter(p => p.id !== id));
}

function addSongToPlaylist(playlistId, song) {
  const playlists = getPlaylists();
  const pl = playlists.find(p => p.id === playlistId);
  if (!pl) return false;
  if (pl.songs.some(s => s.id === song.id)) return false;
  pl.songs.push({ id: song.id, title: song.title, channel: song.channel || "", genre: song.genre || "benim" });
  savePlaylists(playlists);
  return true;
}

function removeSongFromPlaylist(playlistId, songId) {
  const playlists = getPlaylists();
  const pl = playlists.find(p => p.id === playlistId);
  if (!pl) return false;
  pl.songs = pl.songs.filter(s => s.id !== songId);
  savePlaylists(playlists);
  return true;
}

// ---- "Şimdi çalınıyor" (mini oynatıcı devri için) ----
function readNowPlaying() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.nowPlaying) || "null");
  } catch {
    return null;
  }
}

function writeNowPlaying(data) {
  try {
    localStorage.setItem(STORAGE_KEYS.nowPlaying, JSON.stringify(data));
  } catch {
    /* sessiz geç */
  }
}

function clearNowPlaying() {
  try {
    localStorage.removeItem(STORAGE_KEYS.nowPlaying);
  } catch {
    /* sessiz geç */
  }
}

// ---- Spotify: parça adından temiz bir YouTube arama sorgusu üret ----
function cleanTitleForSearch(title) {
  return (title || "")
    .replace(/\(feat[^)]*\)/gi, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/official.*video/gi, "")
    .replace(/lyrics?/gi, "")
    .trim();
}

// ---- Şarkı sözü ayarları (index.html > Ayarlar, player.html okur) ----
const LYRICS_STYLES = [
  { id: "classic",    name: "Klasik",      desc: "Tek satır, yumuşak kayarak geçiş" },
  { id: "spotify",    name: "Spotify",     desc: "Tüm sözler akar, aktif satır parlar" },
  { id: "apple",      name: "Apple Music", desc: "Bulanık satırlar, yaylanan geçiş" },
  { id: "soundcloud", name: "SoundCloud",  desc: "Turuncu, kelime kelime dolan satır" },
];

function getLyricsStyle() {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.lyricsStyle);
    return LYRICS_STYLES.some(s => s.id === v) ? v : "classic";
  } catch {
    return "classic";
  }
}

function setLyricsStyle(id) {
  try { localStorage.setItem(STORAGE_KEYS.lyricsStyle, id); } catch { /* sessiz geç */ }
}

// ---- Şarkı sözü sağlayıcıları: sıra + aç/kapa (index.html > Ayarlar) ----
// Sıra, aramanın hangi sırayla yapılacağını belirler. İlk senkron sonuç kazanır.
const LYRICS_PROVIDER_META = [
  { id: "lrclib",       name: "LRCLIB",               desc: "Geniş katalog, satır senkronlu", defaultOn: true },
  { id: "unison",       name: "Better Lyrics Unison", desc: "Topluluk kaynaklı, YouTube video ID ile eşleşir", defaultOn: true },
  { id: "binilyrics",   name: "BiniLyrics",           desc: "Kelime senkronlu, 1 milyondan fazla dosya", defaultOn: true },
  { id: "musixmatch",   name: "Musixmatch",           desc: "Paxsenix köprüsü üzerinden", defaultOn: true },
  { id: "betterlyrics", name: "Better Lyrics API",    desc: "Sadece önbellekteki şarkılar, albüm bilgisi gerekir (nadir bulur)", defaultOn: false },
];

function getLyricsProviderConfig() {
  const ids = LYRICS_PROVIDER_META.map(p => p.id);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.lyricsProviders) || "null"); } catch { /* sessiz geç */ }

  let order, off;
  if (saved && Array.isArray(saved.order)) {
    order = saved.order.filter(id => ids.includes(id));
    ids.forEach(id => { if (!order.includes(id)) order.push(id); }); // sonradan eklenen sağlayıcılar sona
    off = new Set(Array.isArray(saved.off) ? saved.off : []);
    // Kaydedilmiş ayarda hiç görülmemiş yeni sağlayıcı: varsayılanını uygula
    ids.forEach(id => {
      if (!saved.order.includes(id) && !LYRICS_PROVIDER_META.find(p => p.id === id).defaultOn) off.add(id);
    });
  } else {
    order = ids.slice();
    off = new Set(LYRICS_PROVIDER_META.filter(p => !p.defaultOn).map(p => p.id));
    // Eski "Musixmatch yedek" anahtarı kapalıysa onu koru
    try { if (localStorage.getItem(STORAGE_KEYS.lyricsFallback) === "off") off.add("musixmatch"); } catch { /* sessiz geç */ }
  }
  return { order, off: [...off] };
}

function saveLyricsProviderConfig(cfg) {
  try { localStorage.setItem(STORAGE_KEYS.lyricsProviders, JSON.stringify({ order: cfg.order, off: cfg.off })); } catch { /* sessiz geç */ }
}

// Sırayla, sadece açık olanlar
function getEnabledLyricsProviders() {
  const cfg = getLyricsProviderConfig();
  return cfg.order.filter(id => !cfg.off.includes(id));
}

// ---- Şarkı bilgisini id'den bul (URL'de başlık/kanal taşımamak için) ----
function findSongMeta(id) {
  if (!id) return null;
  const pools = [];
  try { pools.push(getQueue()); } catch { /* sessiz geç */ }
  try { pools.push(getUserSongs()); } catch { /* sessiz geç */ }
  try { pools.push(getCachedSongs() || []); } catch { /* sessiz geç */ }
  try { getPlaylists().forEach(p => pools.push(p.songs || [])); } catch { /* sessiz geç */ }
  try { const np = readNowPlaying(); if (np) pools.push([np]); } catch { /* sessiz geç */ }
  for (const pool of pools) {
    const hit = Array.isArray(pool) && pool.find(s => s && s.id === id && s.title);
    if (hit) return { title: hit.title, channel: hit.channel || "" };
  }
  return null;
}

// Yerelde yoksa (ör. link başka cihazda açıldıysa) başlık/kanalı çevrimiçi bul.
// Önce YouTube'un kendi oEmbed servisi, olmazsa noembed.com (tarayıcıdan okumaya izin verir).
async function fetchSongMetaOnline(id) {
  const watch = encodeURIComponent("https://www.youtube.com/watch?v=" + id);
  const sources = [
    `https://www.youtube.com/oembed?format=json&url=${watch}`,
    `https://noembed.com/embed?url=${watch}`,
  ];
  for (const url of sources) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) continue;
      const d = await res.json();
      if (d && d.title && !d.error) return { title: d.title, channel: d.author_name || "" };
    } catch { /* sıradaki kaynağı dene */ } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

// ---- YouTube linkinden video ID çıkar (watch, youtu.be, shorts, embed, live, music.youtube.com) ----
// Çıplak 11 karakterlik ID kabul edilmez: "Mockingbird" gibi 11 harfli arama kelimeleriyle karışır.
function extractYouTubeId(text) {
  const t = (text || "").trim();
  if (!t || /\s/.test(t)) return null;
  let url;
  try { url = new URL(/^https?:\/\//i.test(t) ? t : "https://" + t); } catch { return null; }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  const ID = /^[\w-]{11}$/;
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return ID.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v && ID.test(v)) return v;
    const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
    if (m) return m[1];
  }
  return null;
}

// ---- Oynatıcı düzeni (kapak / başlık / ilerleme çubuğu) — söz stilinden bağımsız seçilebilir ----
// "auto": seçili söz stiliyle aynı düzeni kullan (varsayılan)
const PLAYER_LAYOUTS = [
  { id: "auto",       name: "Sözlerle aynı", desc: "Seçili söz stilinin düzenini kullanır" },
  { id: "classic",    name: "Klasik",        desc: "Kapak solda, başlık ve çubuk yanında" },
  { id: "spotify",    name: "Spotify",       desc: "Sol altta küçük kapak, tam genişlik çubuk" },
  { id: "apple",      name: "Apple Music",   desc: "Büyük kapak, altında çubuk ve başlık" },
  { id: "soundcloud", name: "SoundCloud",    desc: "Etiket başlık, turuncu dalga çubuğu" },
];

function getPlayerLayout() {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.playerLayout);
    return PLAYER_LAYOUTS.some(l => l.id === v) ? v : "auto";
  } catch {
    return "auto";
  }
}

function setPlayerLayout(id) {
  try { localStorage.setItem(STORAGE_KEYS.playerLayout, id); } catch { /* sessiz geç */ }
}

// Gerçekte uygulanacak düzen ("auto" ise söz stili)
function resolvePlayerLayout() {
  const l = getPlayerLayout();
  return l === "auto" ? getLyricsStyle() : l;
}
