// ================= Şarkı sözü sağlayıcıları =================
// Sıra: 1) LRCLIB  2) Musixmatch (Paxsenix köprüsü)  3) düz metin yedekleri
// Bu dosya sadece veri çeker; ekrana basma işi player.js / lyrics-styles.js'te.

// Musixmatch köprüsü: https://github.com/Paxsenix0/MusixMatch-Lyrics
// Kendi sunucuna kurarsan sadece bu adresi değiştirmen yeterli.
const MUSIXMATCH_ENDPOINT = "https://paxsenixofc.my.id/server/getLyricsMusix.php";

// [mm:ss.xx] zaman damgalı LRC metnini {time, text} dizisine çevirir
function parseLRC(lrcText) {
  const lines = (lrcText || "").split("\n");
  const timeTag = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const result = [];
  lines.forEach((line) => {
    const matches = [...line.matchAll(timeTag)];
    if (!matches.length) return;
    const text = line.replace(timeTag, "").trim();
    matches.forEach((m) => {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const ms = m[3] ? parseInt(m[3].padEnd(3, "0"), 10) : 0;
      result.push({ time: min * 60 + sec + ms / 1000, text });
    });
  });
  return result.sort((a, b) => a.time - b.time);
}

async function fetchWithTimeout(url, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ---------- LRCLIB ----------
async function fetchFromLrclibGet(artist, title) {
  const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  return res.json();
}

async function fetchFromLrclibSearch(artist, title) {
  const url = `https://lrclib.net/api/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  const results = await res.json();
  if (!Array.isArray(results) || !results.length) return null;
  return results.find(r => r.syncedLyrics) || results[0];
}

// -> { synced: [{time,text}] | null, plain: string | null }
async function fetchLrclib(artist, title) {
  let data = null;
  try { data = await fetchFromLrclibGet(artist, title); } catch { /* sessiz geç */ }
  if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
    try { data = await fetchFromLrclibSearch(artist, title); } catch { /* sessiz geç */ }
  }
  if (!data) return { synced: null, plain: null };
  const parsed = data.syncedLyrics ? parseLRC(data.syncedLyrics) : [];
  return {
    synced: parsed.length ? parsed : null,
    plain: data.plainLyrics ? data.plainLyrics.trim() : null,
  };
}

// ---------- Musixmatch ----------
function formatDurationParam(sec) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function musixRequest(params) {
  const res = await fetchWithTimeout(`${MUSIXMATCH_ENDPOINT}?${new URLSearchParams(params)}`, 12000);
  if (!res.ok) return null;
  const text = await res.text();
  const parsed = parseLRC(text);
  // Hata mesajı / boş cevap gelirse zaman damgası bulunmaz -> "yok" say
  return parsed.length >= 2 ? parsed : null;
}

// -> [{time,text}] | null  (sadece senkron söz döner)
async function fetchFromMusixmatch(artist, title, durationSec) {
  // 1) varsayılan: sadece şarkı adı + sanatçı
  try {
    const r = await musixRequest({ q: `${title} ${artist}`, type: "default" });
    if (r) return r;
  } catch { /* sessiz geç */ }

  // 2) alternatif: metadata ile (süre biliniyorsa daha isabetli)
  try {
    const params = { t: title, a: artist, type: "alternative" };
    if (durationSec > 0) params.d = formatDurationParam(durationSec);
    const r = await musixRequest(params);
    if (r) return r;
  } catch { /* sessiz geç */ }

  return null;
}

// ---------- lyrics.ovh (son çare, düz metin) ----------
async function fetchFromLyricsOvh(artist, title) {
  const res = await fetchWithTimeout(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.lyrics ? data.lyrics.trim() : null;
}
