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

// TTML metnini [{time, text, words?}] satır listesine çevirir.
// words: [{t, e, text}] -> kelime başlangıcı / bitişi (saniye, şarkı başından itibaren).
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

  // Zamanlı yaprak span'leri kelime olarak topla. Boşluk metin düğümlerinde olduğu için
  // span'in hemen ardından gelen boşluk, kelimeye "sonda boşluk" olarak işlenir
  // (böylece "ev" + "de" gibi hece parçaları birleşik kalır).
  const collectWords = (p) => {
    const words = [];
    const walk = (node) => {
      node.childNodes.forEach(ch => {
        if (ch.nodeType === 3) {
          if (/\s/.test(ch.nodeValue) && words.length) words[words.length - 1].space = true;
        } else if (ch.nodeType === 1 && !skipRoles.has(roleOf(ch))) {
          const b = parseTtmlTime(ch.getAttribute("begin"));
          const e = parseTtmlTime(ch.getAttribute("end"));
          const hasChildEl = Array.from(ch.childNodes).some(n => n.nodeType === 1);
          if (b !== null && e !== null && !hasChildEl) {
            const text = ch.textContent.replace(/\s+/g, " ");
            if (text.trim()) {
              words.push({ t: b, e, text: text.trim(), space: /\s$/.test(text) });
              if (/^\s/.test(text) && words.length > 1) words[words.length - 2].space = true;
            }
          } else {
            walk(ch);
          }
        }
      });
    };
    walk(p);
    return words;
  };

  // Hece parçalarını (arada boşluk yok) tek kelimede birleştir
  const mergeSyllables = (raw) => {
    const out = [];
    raw.forEach(w => {
      const last = out[out.length - 1];
      if (last && !last.space) {
        last.text += w.text; last.e = w.e; last.space = w.space;
      } else {
        out.push({ t: w.t, e: w.e, text: w.text, space: w.space });
      }
    });
    return out.map(({ t, e, text }) => ({ t, e, text }));
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
    const words = mergeSyllables(collectWords(p));
    // Kelime zamanları satır metniyle tutarlı değilse (ör. eksik span) kelime senkronunu kullanma
    const wordsOk = words.length >= 2 && words.map(w => w.text).join("").replace(/\s/g, "") === text.replace(/\s/g, "");
    const line = { time: begin, end, text };
    if (wordsOk) line.words = words;
    lines.push(line);
  });

  lines.sort((a, b) => a.time - b.time);

  // Uzun boşluklara "♪" noktaları için boş satır ekle
  const result = [];
  lines.forEach((l, i) => {
    const out = { time: l.time, text: l.text };
    if (l.words) out.words = l.words;
    if (l.end != null) out.end = l.end;
    result.push(out);
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


// ================= Söz önbelleği =================
// Bulunan sözler tarayıcıda (localStorage) saklanır: aynı şarkı anında açılır,
// sağlayıcılara tekrar istek gitmez. Kelime zamanları da saklanır.
// Sadece "senkron" sonuçlar kalıcıdır; düz metin 7 gün, "bulunamadı" 1 gün tutulur
// (sonradan daha iyi bir kaynak çıkabilir).
const LYRICS_CACHE_PREFIX = "cinla_lyr_";
const LYRICS_CACHE_INDEX = "cinla_lyr_index";
const LYRICS_CACHE_MAX = 80;
const LYRICS_CACHE_VERSION = 2;
const LYRICS_TTL = { synced: 90 * 864e5, plain: 7 * 864e5, none: 864e5 };

function lyricsCacheIndex() {
  try { return JSON.parse(localStorage.getItem(LYRICS_CACHE_INDEX)) || []; } catch { return []; }
}
function saveLyricsCacheIndex(idx) {
  try { localStorage.setItem(LYRICS_CACHE_INDEX, JSON.stringify(idx)); } catch { /* sessiz geç */ }
}

// -> { synced, plain, source } | { none: true } | null
function getCachedLyrics(videoId) {
  if (!videoId) return null;
  try {
    const raw = localStorage.getItem(LYRICS_CACHE_PREFIX + videoId);
    if (!raw) return null;
    const e = JSON.parse(raw);
    if (!e || e.v !== LYRICS_CACHE_VERSION) return null;
    const kind = e.synced ? "synced" : e.plain ? "plain" : "none";
    if (Date.now() - e.at > LYRICS_TTL[kind]) { dropCachedLyrics(videoId); return null; }
    if (kind === "none") return { none: true };
    return { synced: e.synced || null, plain: e.plain || null, source: e.source || "" };
  } catch { return null; }
}

function dropCachedLyrics(videoId) {
  try { localStorage.removeItem(LYRICS_CACHE_PREFIX + videoId); } catch { /* sessiz geç */ }
  saveLyricsCacheIndex(lyricsCacheIndex().filter(id => id !== videoId));
}

function setCachedLyrics(videoId, result) {
  if (!videoId) return;
  const entry = {
    v: LYRICS_CACHE_VERSION,
    at: Date.now(),
    source: (result && result.source) || "",
    synced: (result && result.synced) || null,
    plain: (result && result.plain) || null,
  };
  const key = LYRICS_CACHE_PREFIX + videoId;
  const write = () => localStorage.setItem(key, JSON.stringify(entry));
  try {
    write();
  } catch {
    // Kota doldu: en eski kayıtları silerek yeniden dene
    let idx = lyricsCacheIndex();
    for (let i = 0; i < 10 && idx.length; i++) {
      try { localStorage.removeItem(LYRICS_CACHE_PREFIX + idx.shift()); } catch { /* sessiz geç */ }
      try { write(); break; } catch { /* tekrar dene */ }
    }
    saveLyricsCacheIndex(idx);
    if (!localStorage.getItem(key)) return;
  }
  // En son kullanılan sona; sınırı aşanları ele
  let idx = lyricsCacheIndex().filter(id => id !== videoId);
  idx.push(videoId);
  while (idx.length > LYRICS_CACHE_MAX) {
    try { localStorage.removeItem(LYRICS_CACHE_PREFIX + idx.shift()); } catch { /* sessiz geç */ }
  }
  saveLyricsCacheIndex(idx);
}
