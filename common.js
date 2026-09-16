// ---- Ortak depolama anahtarları ----
const STORAGE_KEYS = {
  apiKey: "cinla_yt_api_key",
  userSongs: "cinla_user_songs",
  cachedSongs: "cinla_cached_songs",
  queue: "cinla_queue",
  queueMeta: "cinla_queue_meta",
  playlists: "cinla_playlists",
  spotifyId: "cinla_spotify_client_id",
  spotifySecret: "cinla_spotify_client_secret",
  nowPlaying: "cinla_now_playing",
};

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
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

// ---- Spotify kimlik bilgileri ----
function getSpotifyCreds() {
  return {
    id: localStorage.getItem(STORAGE_KEYS.spotifyId) || "",
    secret: localStorage.getItem(STORAGE_KEYS.spotifySecret) || "",
  };
}

function setSpotifyCreds(id, secret) {
  localStorage.setItem(STORAGE_KEYS.spotifyId, id || "");
  localStorage.setItem(STORAGE_KEYS.spotifySecret, secret || "");
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
