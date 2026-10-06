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

// ================= TTML (Apple tarzı, kelime/satır senkronlu) =================
// "3.465", "1:23.456", "00:01:23.456", "12.5s" biçimlerini saniyeye çevirir
function parseTtmlTime(str) {
  if (!str) return null;
  str = String(str).trim();
  if (/^\d+(\.\d+)?s$/.test(str)) return parseFloat(str);
  const parts = str.split(":");
  if (!parts.length || parts.some(p => p === "" || isNaN(Number(p)))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

// TTML metnini [{time, text}] satır listesine çevirir (kelime zamanlarından satır başı alınır).
// Çeviri / romanizasyon span'leri atlanır; uzun enstrümantal boşluklara boş satır eklenir.
function parseTTML(xmlText) {
  if (!xmlText || xmlText.indexOf("<") === -1) return [];
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return [];

  const skipRoles = new Set(["x-translation", "x-roman"]);
  const roleOf = (el) => el.getAttribute("ttm:role") || el.getAttributeNS("http://www.w3.org/ns/ttml#metadata", "role") || "";

  const collect = (node) => {
    let out = "";
    node.childNodes.forEach(ch => {
      if (ch.nodeType === 3) out += ch.nodeValue;
      else if (ch.nodeType === 1 && !skipRoles.has(roleOf(ch))) out += collect(ch);
    });
    return out;
  };

  const lines = [];
  const ps = Array.from(doc.getElementsByTagName("p"));
  ps.forEach(p => {
    let begin = parseTtmlTime(p.getAttribute("begin"));
    let end = parseTtmlTime(p.getAttribute("end"));
    if (begin === null) {
      const firstSpan = p.getElementsByTagName("span")[0];
      if (firstSpan) begin = parseTtmlTime(firstSpan.getAttribute("begin"));
    }
    if (begin === null) return;
    const text = collect(p).replace(/\s+/g, " ").trim();
    if (!text) return;
    lines.push({ time: begin, end, text });
  });

  lines.sort((a, b) => a.time - b.time);

  // Uzun boşluklara "♪" noktaları için boş satır ekle
  const result = [];
  lines.forEach((l, i) => {
    result.push({ time: l.time, text: l.text });
    const next = lines[i + 1];
    if (l.end != null && next && next.time - l.end >= 6) result.push({ time: l.end, text: "" });
  });
  return result;
}

// ---------- Unison (topluluk kaynaklı, YouTube video ID ile) ----------
// Belge: https://docs.betterlyrics.org/unison  (anahtar gerekmez)
function unisonToResult(data) {
  if (!data || !data.lyrics) return { synced: null, plain: null };
  let synced = null;
  let plain = null;
  if (data.format === "ttml") synced = parseTTML(data.lyrics);
  else if (data.format === "lrc") synced = parseLRC(data.lyrics);
  else plain = String(data.lyrics).trim();
  if (synced && synced.length < 2) synced = null;
  return { synced, plain };
}

async function unisonRequest(params) {
  const res = await fetchWithTimeout(`https://unison.boidu.dev/lyrics?${new URLSearchParams(params)}`, 9000);
  if (!res.ok) return null;
  const json = await res.json();
  return json && json.success ? unisonToResult(json.data) : null;
}

async function fetchFromUnison(videoId, artist, title, durationSec) {
  if (videoId) {
    try {
      const r = await unisonRequest({ v: videoId });
      if (r && (r.synced || r.plain)) return r;
    } catch { /* sessiz geç */ }
  }
  try {
    const params = { song: title, artist };
    if (durationSec > 0) params.duration = String(Math.round(durationSec));
    const r = await unisonRequest(params);
    if (r && (r.synced || r.plain)) return r;
  } catch { /* sessiz geç */ }
  return { synced: null, plain: null };
}

// ---------- BiniLyrics (kelime senkronlu TTML) ----------
// Belge: https://lyrics.binimum.org/developers  (anahtar gerekmez)
async function fetchFromBiniLyrics(artist, title, durationSec) {
  try {
    const params = { track: title, artist };
    if (durationSec > 0) params.duration = String(Math.round(durationSec));
    const res = await fetchWithTimeout(`https://lyrics-api.binimum.org/?${new URLSearchParams(params)}`, 9000);
    if (!res.ok) return { synced: null, plain: null };
    const json = await res.json();
    const results = (json && Array.isArray(json.results)) ? json.results.filter(r => r.lyricsUrl) : [];
    if (!results.length) return { synced: null, plain: null };

    // Süre biliniyorsa en yakın olanı, bilinmiyorsa kelime senkronlu olanı tercih et
    results.sort((a, b) => {
      if (durationSec > 0) return Math.abs((a.duration || 0) - durationSec) - Math.abs((b.duration || 0) - durationSec);
      return (b.timing_type === "word") - (a.timing_type === "word");
    });
    const best = results[0];
    if (durationSec > 0 && best.duration && Math.abs(best.duration - durationSec) > 12) {
      return { synced: null, plain: null }; // farklı bir kayıt (remix/canlı) olabilir
    }
    const ttmlRes = await fetchWithTimeout(best.lyricsUrl, 9000);
    if (!ttmlRes.ok) return { synced: null, plain: null };
    const parsed = parseTTML(await ttmlRes.text());
    return { synced: parsed.length >= 2 ? parsed : null, plain: null };
  } catch {
    return { synced: null, plain: null };
  }
}

// ---------- Better Lyrics API (sadece önbellekteki şarkılar) ----------
// Belge: https://docs.betterlyrics.org  Albüm bilgisi olmadan çoğu istek önbellekte bulunamaz (401/404).
async function fetchFromBetterLyricsApi(artist, title, durationSec) {
  try {
    const params = { s: title, a: artist, al: "", d: durationSec > 0 ? String(Math.round(durationSec)) : "" };
    const res = await fetchWithTimeout(`https://api.betterlyrics.org/getLyrics?${new URLSearchParams(params)}`, 7000);
    if (!res.ok) return { synced: null, plain: null };
    const json = await res.json();
    const parsed = json && json.ttml ? parseTTML(json.ttml) : [];
    return { synced: parsed.length >= 2 ? parsed : null, plain: null };
  } catch {
    return { synced: null, plain: null };
  }
}
