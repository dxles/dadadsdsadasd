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

// Musixmatch yedek sağlayıcısı (LRCLIB bulamazsa denenir). Varsayılan: açık.
function getLyricsFallbackEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEYS.lyricsFallback) !== "off";
  } catch {
    return true;
  }
}

function setLyricsFallbackEnabled(on) {
  try { localStorage.setItem(STORAGE_KEYS.lyricsFallback, on ? "on" : "off"); } catch { /* sessiz geç */ }
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

// Yerelde yoksa (ör. link başka cihazda açıldıysa) YouTube oEmbed'den çek
async function fetchSongMetaOnline(id) {
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://www.youtube.com/watch?v=" + id)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    return d && d.title ? { title: d.title, channel: d.author_name || "" } : null;
  } catch {
    return null;
  }
}
