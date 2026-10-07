// ================= Yardımcılar =================
// URL sadece ?v=VIDEO_ID taşır. Eski linklerde t/c varsa onları da okur,
// yoksa başlık/kanal yerel kayıttan (sıra, listeler, önbellek) bulunur.
function getParams() {
  const p = new URLSearchParams(window.location.search);
  const id = p.get("v") || "";
  let title = p.get("t") || "";
  let channel = p.get("c") || "";
  if (!title) {
    const meta = findSongMeta(id);
    if (meta) { title = meta.title; channel = meta.channel; }
  }
  return { id, title, channel, needsMeta: !title };
}

// Adres çubuğunu temizle: player.html?v=ID
function cleanUrl(id) {
  try {
    const url = new URL(window.location.href);
    url.search = "";
    if (id) url.searchParams.set("v", id);
    window.history.replaceState({}, "", url);
  } catch { /* sessiz geç */ }
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Şarkı sözü aramaları için başlığı temizle (parantez, "official video" vb.)
function stripNoise(str) {
  return (str || "")
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/official.*video/gi, "")
    .replace(/official.*audio/gi, "")
    .replace(/lyrics?/gi, "")
    .replace(/\bhd\b|\b4k\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// YouTube başlıkları genelde "Sanatçı - Şarkı Adı" kalıbındadır.
// Bunu ayrıştırıp lyrics API'lerine doğru artist/title çiftini vermek
// için birkaç arama adayı üretir (en olası olandan en genele doğru).
function buildLyricsQueryCandidates(videoTitle, channelName) {
  const cleanTitle = stripNoise(videoTitle);
  const cleanChannel = stripNoise(channelName).replace(/\s*-\s*Topic$/i, "").trim();
  const candidates = [];
  const seen = new Set();

  const addCandidate = (artist, title) => {
    artist = (artist || "").trim();
    title = (title || "").trim();
    if (!artist || !title) return;
    const key = `${artist.toLowerCase()}|${title.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ artist, title });
  };

  // "Artist - Title" veya "Artist – Title" ayır (ilk tire noktasından böl)
  const dashMatch = cleanTitle.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    const [, left, right] = dashMatch;
    // En olası: tiredeki sağ taraf = şarkı adı, sol taraf = sanatçı
    addCandidate(left, right);
    // Kanal adı daha güvenilir olabilir, sağ tarafı onunla da dene
    addCandidate(cleanChannel, right);
  }

  // Tire yoksa veya yukarıdakiler tutmazsa: kanal = sanatçı, tüm temiz
  // başlık = şarkı adı
  addCandidate(cleanChannel, cleanTitle);

  return candidates;
}

// ================= DOM =================
const stage = document.getElementById("stage");
const coverImg = document.getElementById("coverImg");
const trackTitle = document.getElementById("trackTitle");
const trackChannel = document.getElementById("trackChannel");
const playerStatus = document.getElementById("playerStatus");
const seekBar = document.getElementById("seekBar");
const curTimeEl = document.getElementById("curTime");
const durTimeEl = document.getElementById("durTime");
const lyricsStatus = document.getElementById("lyricsStatus");
const lyricsContent = document.getElementById("lyricsContent");
const lyricsContainerOuter = document.getElementById("lyricsContainerOuter");
const backLink = document.getElementById("backLink");

const queueToggleBtn = document.getElementById("queueToggleBtn");
const queuePanel = document.getElementById("queuePanel");
const queueList = document.getElementById("queueList");
const queueCloseBtn = document.getElementById("queueCloseBtn");

const shuffleBtn = document.getElementById("shuffleBtn");
const backBtn = document.getElementById("backBtn");
const playBtn = document.getElementById("playBtn");
const fwdBtn = document.getElementById("fwdBtn");
const repeatBtn = document.getElementById("repeatBtn");
const muteBtn = document.getElementById("muteBtn");
const volumeSlider = document.getElementById("volumeSlider");

// ================= Durum =================
let current = getParams();
let queue = getQueue();
let ytPlayer = null;
let isPlaying = false;
let isSeeking = false;
let shuffleOn = false;
let repeatOn = false;
let progressInterval = null;
let lastVolume = 100;
let syncedLyrics = null; // [{time, text}, ...] ya da null (senkron yoksa)
let lyricsLoadId = 0;    // şarkı hızlı değişirse eski isteğin sonucunu çöpe atmak için
let lyricsSourceName = "";
let lyricsRenderer = null; // LyricsRenderer (senkron sözler için)

// ================= İlerleme dolgusu + SoundCloud dalga çubuğu =================
const progressArea = document.querySelector(".progress-area");
const waveBars = document.getElementById("waveBars");

function setProgressFill(cur, dur) {
  const pct = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
  progressArea.style.setProperty("--p", pct.toFixed(2) + "%");
}

// Video kimliğinden tohumlanan sahte dalga formu (her şarkıda aynı, şarkılar arasında farklı)
function buildWave(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rand = () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const N = 125;
  let prev = 0.5;
  let rects = "";
  for (let i = 0; i < N; i++) {
    const v = 0.55 * rand() + 0.45 * prev;
    prev = v;
    const hgt = 14 + v * 56;                // üst bölüm (0-70)
    const x = i * 8;
    rects += `<rect x="${x}" y="${(70 - hgt).toFixed(1)}" width="5" height="${hgt.toFixed(1)}" rx="1.5"/>`;
    rects += `<rect x="${x}" y="72" width="5" height="${(hgt * 0.4).toFixed(1)}" rx="1.5" fill-opacity="0.45"/>`; // yansıma
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 100" preserveAspectRatio="none">${rects}</svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  waveBars.style.webkitMaskImage = url;
  waveBars.style.maskImage = url;
}

// Seçili stil oynatıcı düzenini de belirler (CSS: body[data-layout=...])
function applyLayout() {
  document.body.dataset.layout = resolvePlayerLayout();
}
applyLayout();

// Başlık hiçbir yerden bulunamadıysa YouTube oynatıcısının kendi video bilgisini kullan
let awaitingPlayerMeta = false;
function tryMetaFromPlayer() {
  if (!awaitingPlayerMeta || !ytPlayer || !ytPlayer.getVideoData) return;
  let d = null;
  try { d = ytPlayer.getVideoData(); } catch { /* henüz hazır değil */ }
  if (!d || !d.title) return;
  awaitingPlayerMeta = false;
  current = { id: current.id, title: d.title, channel: d.author || "" };
  applyTrackMeta(current);
  renderQueuePanel();
  loadLyrics(current);
}

// ================= Kapak / Başlık =================
function applyTrackMeta(track) {
  buildWave(track.id || "x");
  const cover = `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`;
  coverImg.src = cover;
  trackTitle.textContent = track.title;
  trackChannel.textContent = track.channel || "";
  document.title = `${track.title} — Nowtify`;
}

// ================= YouTube Player =================
function initPlayer() {
  if (!current.id) {
    trackTitle.textContent = "Şarkı bulunamadı";
    playerStatus.textContent = "Geçersiz bağlantı — lütfen listeye dönüp tekrar dene.";
    return;
  }

  applyTrackMeta(current);
  playerStatus.textContent = "Yükleniyor...";

  createYtPlayer("ytPlayerHost", current.id, {
    onReady: (e) => {
      ytPlayer = e.target;
      const savedVolume = Number(localStorage.getItem("cinla_volume"));
      const vol = savedVolume >= 0 && savedVolume <= 100 ? savedVolume : 100;
      ytPlayer.setVolume(vol);
      volumeSlider.value = vol;
      lastVolume = vol || 100;
      ytPlayer.playVideo();
      playerStatus.textContent = "";
      const dur0 = ytPlayer.getDuration() || 0;
      if (dur0 > 0) {
        seekBar.max = String(dur0);
        durTimeEl.textContent = formatTime(dur0);
      }
      progressInterval = setInterval(updateProgress, 250);
    },
    onStateChange: (e) => {
      if (e.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        if (lyricsRenderer) lyricsRenderer.setPaused(false);
        setPlayIcon(true);
        stage.classList.add("is-playing");
        
        // Şarkı çalmaya başladığında adblock uyarısını gizle
        const adblockHint = document.getElementById("adblockHint");
        if (adblockHint) {
          adblockHint.style.display = "none";
        }
      } else if (e.data === YT.PlayerState.PAUSED) {
        isPlaying = false;
        if (lyricsRenderer) lyricsRenderer.setPaused(true);
        setPlayIcon(false);
        stage.classList.remove("is-playing");
      } else if (e.data === YT.PlayerState.ENDED) {
        isPlaying = false;
        handleTrackEnded();
      }
    },
    onError: () => {
      playerStatus.textContent = "Bu video oynatılamıyor, sıradaki şarkıya geçiliyor...";
      setTimeout(() => playNext(), 1500);
    },
  });
}

function updateProgress() {
  if (!ytPlayer || !ytPlayer.getCurrentTime) return;
  if (awaitingPlayerMeta) tryMetaFromPlayer();
  if (isSeeking) return;
  const dur = ytPlayer.getDuration() || 0;
  const cur = ytPlayer.getCurrentTime() || 0;
  if (dur > 0) {
    seekBar.max = String(dur);
    durTimeEl.textContent = formatTime(dur);
  }
  seekBar.value = String(cur);
  curTimeEl.textContent = formatTime(cur);
  setProgressFill(cur, dur);
  updateActiveLyricLine(cur);

  // Mini oynatıcı ile devam edebilmek için ilerlemeyi kaydet
  writeNowPlaying({
    id: current.id,
    title: current.title,
    channel: current.channel,
    progress: cur,
    isPlaying,
    volume: ytPlayer.getVolume ? ytPlayer.getVolume() : 100,
    updatedAt: Date.now(),
  });
}

function setPlayIcon(playing) {
  playBtn.innerHTML = playing
    ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`
    : `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
}

// ================= Sıradaki / Önceki =================
function findQueueIndex() {
  return queue.findIndex(s => s.id === current.id);
}

function goToTrack(song) {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  current = { id: song.id, title: song.title, channel: song.channel || "" };
  cleanUrl(current.id);

  applyTrackMeta(current);
  loadLyrics(current);
  renderQueuePanel();

  seekBar.value = "0";
  seekBar.max = "100";
  setProgressFill(0, 0);
  curTimeEl.textContent = "0:00";
  durTimeEl.textContent = "0:00";

  if (ytPlayer && ytPlayer.loadVideoById) {
    ytPlayer.loadVideoById(current.id);
    if (!progressInterval) progressInterval = setInterval(updateProgress, 250);
  } else {
    initPlayer();
  }
}

function playNext() {
  if (!queue.length) return;
  const idx = findQueueIndex();
  let nextIdx;
  if (shuffleOn) {
    nextIdx = Math.floor(Math.random() * queue.length);
  } else {
    nextIdx = idx === -1 ? 0 : (idx + 1) % queue.length;
  }
  goToTrack(queue[nextIdx]);
}

function playPrev() {
  if (!queue.length) return;
  const idx = findQueueIndex();
  let prevIdx;
  if (shuffleOn) {
    prevIdx = Math.floor(Math.random() * queue.length);
  } else {
    prevIdx = idx <= 0 ? queue.length - 1 : idx - 1;
  }
  goToTrack(queue[prevIdx]);
}

function handleTrackEnded() {
  if (repeatOn) {
    ytPlayer.seekTo(0, true);
    ytPlayer.playVideo();
    return;
  }
  if (queue.length > 1) {
    playNext();
  } else {
    clearNowPlaying();
  }
}

// ================= Çalma Sırası Paneli =================
function renderQueuePanel() {
  if (!queue.length) {
    queueList.innerHTML = `<div class="queue-empty">Çalma sırası boş. Listeye dönüp bir şarkı seçtiğinde burada görünecek.</div>`;
    return;
  }
  queueList.innerHTML = "";
  queue.forEach(song => {
    const row = document.createElement("div");
    row.className = "queue-item" + (song.id === current.id ? " active" : "");
    row.innerHTML = `
      <img src="https://i.ytimg.com/vi/${song.id}/default.jpg" alt="">
      <div class="queue-item-info">
        <p class="queue-item-title">${escapeHtml(song.title)}</p>
        <p class="queue-item-channel">${escapeHtml(song.channel || "")}</p>
      </div>
      ${song.id === current.id ? '<span class="queue-now-badge">Çalıyor</span>' : ""}
    `;
    row.addEventListener("click", () => {
      if (song.id !== current.id) goToTrack(song);
    });
    queueList.appendChild(row);
  });
}

function openQueuePanel() {
  queuePanel.classList.add("open");
}
function closeQueuePanel() {
  queuePanel.classList.remove("open");
}

// ================= Şarkı Sözleri =================
// Sağlayıcılar lyrics-providers.js'te, görünümler lyrics-styles.js'te.

function getRenderer() {
  if (!lyricsRenderer) {
    lyricsRenderer = new LyricsRenderer(lyricsContent, {
      style: getLyricsStyle(),
      onSeek: (t) => { if (ytPlayer && ytPlayer.seekTo) ytPlayer.seekTo(t, true); },
    });
  }
  return lyricsRenderer;
}

function setLyricsSourceLabel(name, plain) {
  lyricsSourceName = name || "";
  const info = document.getElementById("lyricsSourceInfo");
  if (!info) return;
  info.textContent = name ? `Kaynak: ${name}${plain ? " (senkronsuz)" : ""}` : "";
}

function setLyricsStatus(text) {
  lyricsStatus.textContent = text || "";
  lyricsStatus.classList.toggle("hidden", !text);
}

function resetLyricsView() {
  syncedLyrics = null;
  if (lyricsRenderer) { lyricsRenderer.destroy(); lyricsRenderer = null; }
  lyricsContent.innerHTML = "";
  lyricsContainerOuter.classList.remove("lyrics-plain-mode", "lyrics-synced-mode", "lyrics-list-mode");
  setLyricsSourceLabel("");
}

function renderSyncedLyrics(lines, sourceName) {
  syncedLyrics = lines;
  setLyricsStatus("");
  lyricsContainerOuter.classList.remove("lyrics-plain-mode");
  lyricsContainerOuter.classList.add("lyrics-synced-mode");
  const style = getLyricsStyle();
  lyricsContainerOuter.classList.toggle("lyrics-list-mode", style !== "classic");
  if (lyricsRenderer) lyricsRenderer.destroy();
  lyricsRenderer = null; // temiz kurulum
  lyricsContent.innerHTML = "";
  const r = getRenderer();
  r.setStyle(style);
  r.setLines(lines);
  r.setPaused(!isPlaying);
  if (ytPlayer && ytPlayer.getCurrentTime) r.update(ytPlayer.getCurrentTime() || 0);
  setLyricsSourceLabel(sourceName, false);
}

function renderPlainLyrics(text, sourceName) {
  syncedLyrics = null;
  if (lyricsRenderer) { lyricsRenderer.destroy(); lyricsRenderer = null; }
  setLyricsStatus("");
  lyricsContainerOuter.classList.remove("lyrics-synced-mode", "lyrics-list-mode");
  lyricsContainerOuter.classList.add("lyrics-plain-mode");
  lyricsContent.innerHTML = text
    .split("\n")
    .map(line => `<p>${escapeHtml(line) || "&nbsp;"}</p>`)
    .join("");
  setLyricsSourceLabel(sourceName, true);
}

function updateActiveLyricLine(currentTime) {
  if (!syncedLyrics || !lyricsRenderer) return;
  lyricsRenderer.update(currentTime);
}

// Sağlayıcılar Ayarlar'daki sıraya göre sırayla denenir (açık olanlar). İlk senkron sonuç kazanır.
// Hiçbiri senkron bulamazsa ilk bulunan düz metin, o da yoksa lyrics.ovh denenir.
const PROVIDER_NAMES = Object.fromEntries(LYRICS_PROVIDER_META.map(p => [p.id, p.name]));

function currentDuration() {
  return ytPlayer && ytPlayer.getDuration ? (ytPlayer.getDuration() || 0) : 0;
}

// Her sağlayıcı { synced, plain } döner. Adaylar (sanatçı/şarkı tahminleri) en olasıdan genele sıralı.
async function runLyricsProvider(id, candidates, track) {
  const empty = { synced: null, plain: null };
  const dur = currentDuration();

  if (id === "lrclib") {
    let plain = null;
    for (const { artist, title } of candidates) {
      const r = await fetchLrclib(artist, title);
      if (r.synced) return r;
      if (r.plain && !plain) plain = r.plain;
    }
    return { synced: null, plain };
  }

  if (id === "unison") {
    const first = candidates[0];
    return fetchFromUnison(track.id, first.artist, first.title, dur);
  }

  // Diğerleri: ilk 3 adayı sırayla dene
  for (const { artist, title } of candidates.slice(0, 3)) {
    let r = empty;
    if (id === "binilyrics") r = await fetchFromBiniLyrics(artist, title, dur);
    else if (id === "betterlyrics") r = await fetchFromBetterLyricsApi(artist, title, dur);
    else if (id === "musixmatch") {
      const synced = await fetchFromMusixmatch(artist, title, dur);
      r = { synced, plain: null };
    }
    if (r.synced) return r;
  }
  return empty;
}

async function loadLyrics(track) {
  const myId = ++lyricsLoadId;
  const stale = () => myId !== lyricsLoadId;

  resetLyricsView();
  const candidates = buildLyricsQueryCandidates(track.title, track.channel);
  if (!candidates.length) {
    setLyricsStatus("Bu şarkı için söz bulunamadı.");
    return;
  }

  let firstPlain = null; // { text, source }
  for (const id of getEnabledLyricsProviders()) {
    setLyricsStatus(`${PROVIDER_NAMES[id] || id} aranıyor...`);
    try {
      const r = await runLyricsProvider(id, candidates, track);
      if (stale()) return;
      if (r.synced) { renderSyncedLyrics(r.synced, PROVIDER_NAMES[id] || id); return; }
      if (r.plain && !firstPlain) firstPlain = { text: r.plain, source: PROVIDER_NAMES[id] || id };
    } catch { /* sessiz geç */ }
  }

  // Senkron yok: düz metin
  if (firstPlain) { renderPlainLyrics(firstPlain.text, firstPlain.source); return; }
  setLyricsStatus("Sözler aranıyor...");
  for (const { artist, title } of candidates) {
    try {
      const lyrics = await fetchFromLyricsOvh(artist, title);
      if (stale()) return;
      if (lyrics) { renderPlainLyrics(lyrics, "lyrics.ovh"); return; }
    } catch { /* sessiz geç */ }
  }

  if (!stale()) setLyricsStatus("Bu şarkı için söz bulunamadı.");
}

// ================= Söz stili menüsü =================
const lyricsStyleBtn = document.getElementById("lyricsStyleBtn");
const lyricsStyleMenu = document.getElementById("lyricsStyleMenu");
const lyricsStyleOptions = document.getElementById("lyricsStyleOptions");

function applyLyricsStyle(id) {
  setLyricsStyle(id);
  applyLayout();
  renderLyricsStyleMenu();
  // Senkron söz varsa yeni stille baştan çiz (aynı sözler, aynı an)
  if (syncedLyrics) renderSyncedLyrics(syncedLyrics, lyricsSourceName);
}

function renderLyricsStyleMenu() {
  const active = getLyricsStyle();
  lyricsStyleOptions.innerHTML = "";
  LYRICS_STYLES.forEach(st => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lsm-opt" + (st.id === active ? " selected" : "");
    b.setAttribute("role", "menuitemradio");
    b.setAttribute("aria-checked", st.id === active ? "true" : "false");
    b.innerHTML = `<span>${escapeHtml(st.name)}<small>${escapeHtml(st.desc)}</small></span><span class="lsm-check">✓</span>`;
    b.addEventListener("click", () => applyLyricsStyle(st.id));
    lyricsStyleOptions.appendChild(b);
  });
}

function renderLayoutMenu() {
  const active = getPlayerLayout();
  const box = document.getElementById("layoutOptions");
  box.innerHTML = "";
  PLAYER_LAYOUTS.forEach(l => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lsm-chip" + (l.id === active ? " selected" : "");
    b.title = l.desc;
    b.setAttribute("role", "menuitemradio");
    b.setAttribute("aria-checked", l.id === active ? "true" : "false");
    b.textContent = l.name;
    b.addEventListener("click", () => {
      setPlayerLayout(l.id);
      applyLayout();
      renderLayoutMenu();
    });
    box.appendChild(b);
  });
}

function setLyricsMenuOpen(open) {
  lyricsStyleMenu.hidden = !open;
  lyricsStyleBtn.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) { renderLyricsStyleMenu(); renderLayoutMenu(); }
}

// ================= HUD Otomatik Gizleme =================
let hudTimeout = null;
function showHud() {
  document.body.classList.remove("hud-hidden");
  scheduleHudHide();
}
function scheduleHudHide() {
  clearTimeout(hudTimeout);
  hudTimeout = setTimeout(() => {
    if (queuePanel.classList.contains("open") || !lyricsStyleMenu.hidden) return;
    document.body.classList.add("hud-hidden");
  }, 3000);
}
["mousemove", "mousedown", "touchstart", "keydown"].forEach(evt => {
  window.addEventListener(evt, showHud, { passive: true });
});

// ================= Kontroller =================
function togglePlay() {
  if (!ytPlayer) return;
  if (isPlaying) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
}

function seekRelative(seconds) {
  if (!ytPlayer || !ytPlayer.getCurrentTime) return;
  const target = Math.max(0, ytPlayer.getCurrentTime() + seconds);
  ytPlayer.seekTo(target, true);
}

function toggleMute() {
  if (!ytPlayer) return;
  if (ytPlayer.isMuted()) {
    ytPlayer.unMute();
    ytPlayer.setVolume(lastVolume || 100);
    volumeSlider.value = lastVolume || 100;
  } else {
    lastVolume = ytPlayer.getVolume();
    ytPlayer.mute();
    volumeSlider.value = 0;
  }
}

function init() {
  cleanUrl(current.id);
  applyTrackMeta(current);
  renderQueuePanel();
  if (current.needsMeta) {
    // Başlık yerelde yok (link başka yerde açıldı): oEmbed'den çek, sonra sözleri ara
    trackTitle.textContent = "Yükleniyor...";
    const wantedId = current.id;
    fetchSongMetaOnline(wantedId).then(meta => {
      if (current.id !== wantedId) return;
      current = { id: wantedId, title: (meta && meta.title) || "Bilinmeyen Şarkı", channel: (meta && meta.channel) || "" };
      applyTrackMeta(current);
      renderQueuePanel();
      if (meta) loadLyrics(current);
      else {
        // Çevrimiçi servisler yanıt vermedi: başlığı YouTube oynatıcısından alacağız
        awaitingPlayerMeta = true;
        trackTitle.textContent = "Yükleniyor...";
        setLyricsStatus("Video bilgisi bekleniyor...");
        tryMetaFromPlayer();
      }
    });
  } else {
    loadLyrics(current);
  }
  initPlayer();
  renderLyricsStyleMenu();

  lyricsStyleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setLyricsMenuOpen(lyricsStyleMenu.hidden);
  });
  document.addEventListener("click", (e) => {
    // composedPath: tıklanan öğe liste yeniden çizilirken DOM'dan çıksa bile menünün içinden sayılır
    if (!lyricsStyleMenu.hidden && !e.composedPath().includes(lyricsStyleMenu)) setLyricsMenuOpen(false);
  });
  scheduleHudHide();

  playBtn.addEventListener("click", togglePlay);
  backBtn.addEventListener("click", () => seekRelative(-10));
  fwdBtn.addEventListener("click", () => seekRelative(10));

  shuffleBtn.addEventListener("click", () => {
    shuffleOn = !shuffleOn;
    shuffleBtn.classList.toggle("active", shuffleOn);
  });

  repeatBtn.addEventListener("click", () => {
    repeatOn = !repeatOn;
    repeatBtn.classList.toggle("active", repeatOn);
  });

  muteBtn.addEventListener("click", toggleMute);

  volumeSlider.addEventListener("input", () => {
    const v = Number(volumeSlider.value);
    if (ytPlayer) {
      ytPlayer.setVolume(v);
      if (v > 0 && ytPlayer.isMuted()) ytPlayer.unMute();
    }
    lastVolume = v || lastVolume;
    localStorage.setItem("cinla_volume", String(v));
  });

  function commitSeek() {
    if (ytPlayer && ytPlayer.seekTo) ytPlayer.seekTo(Number(seekBar.value), true);
    isSeeking = false;
  }
  seekBar.addEventListener("pointerdown", () => { isSeeking = true; });
  seekBar.addEventListener("input", () => {
    isSeeking = true;
    curTimeEl.textContent = formatTime(Number(seekBar.value));
    setProgressFill(Number(seekBar.value), Number(seekBar.max));
  });
  seekBar.addEventListener("change", commitSeek);
  seekBar.addEventListener("pointerup", commitSeek);
  seekBar.addEventListener("touchend", commitSeek);

  queueToggleBtn.addEventListener("click", () => {
    if (queuePanel.classList.contains("open")) closeQueuePanel();
    else openQueuePanel();
  });
  queueCloseBtn.addEventListener("click", closeQueuePanel);

  backLink.addEventListener("click", () => {
    if (ytPlayer && ytPlayer.getCurrentTime) {
      writeNowPlaying({
        id: current.id,
        title: current.title,
        channel: current.channel,
        progress: ytPlayer.getCurrentTime(),
        isPlaying,
        volume: ytPlayer.getVolume ? ytPlayer.getVolume() : 100,
        updatedAt: Date.now(),
      });
    }
  });

  window.addEventListener("pagehide", () => {
    if (ytPlayer && ytPlayer.getCurrentTime && isPlaying) {
      writeNowPlaying({
        id: current.id,
        title: current.title,
        channel: current.channel,
        progress: ytPlayer.getCurrentTime(),
        isPlaying,
        volume: ytPlayer.getVolume ? ytPlayer.getVolume() : 100,
        updatedAt: Date.now(),
      });
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !lyricsStyleMenu.hidden) { setLyricsMenuOpen(false); return; }
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.code === "ArrowRight") seekRelative(5);
    else if (e.code === "ArrowLeft") seekRelative(-5);
  });
}

init();
