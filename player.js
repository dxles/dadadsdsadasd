// ================= Yardımcılar =================
function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    id: p.get("v") || "",
    title: p.get("t") || "Bilinmeyen Şarkı",
    channel: p.get("c") || "",
  };
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
const equalizer = document.getElementById("equalizer");
const lyricsStatus = document.getElementById("lyricsStatus");
const lyricsContent = document.getElementById("lyricsContent");
const lyricsContainerOuter = document.getElementById("lyricsContainerOuter");
const backLink = document.getElementById("backLink");

const ytPlayerHost = document.getElementById("ytPlayerHost");
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
let eqTweens = [];
let lastVolume = 100;
let syncedLyrics = null; // [{time, text}, ...] ya da null (senkron yoksa)
let lyricsCurrentIndex = -1;

// [mm:ss.xx] zaman damgalı LRC metnini {time, text} dizisine çevirir
function parseLRC(lrcText) {
  const lines = (lrcText || "").split("\n");
  const timeTag = /\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
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

// ================= Kapak / Başlık =================
function applyTrackMeta(track) {
  const cover = `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`;
  coverImg.src = cover;
  bgBlur.style.backgroundImage = `url('${cover}')`;
  trackTitle.textContent = track.title;
  trackChannel.textContent = track.channel || "";
  document.title = `${track.title} — Nowtify`;
}

// ================= Eşitleyici (equalizer) animasyonu =================
function startEqualizer() {
  stopEqualizerTweens();
  const bars = equalizer.querySelectorAll("span");
  if (window.gsap) {
    bars.forEach((bar, i) => {
      const tw = gsap.to(bar, {
        height: () => 8 + Math.random() * 34,
        duration: 0.3 + Math.random() * 0.25,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        delay: i * 0.05,
      });
      eqTweens.push(tw);
    });
  }
  equalizer.classList.add("playing");
}

function stopEqualizerTweens() {
  eqTweens.forEach(t => t.kill());
  eqTweens = [];
  equalizer.classList.remove("playing");
  const bars = equalizer.querySelectorAll("span");
  if (window.gsap) {
    bars.forEach(bar => gsap.to(bar, { height: 6, duration: 0.2 }));
  }
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
        setPlayIcon(true);
        startEqualizer();
        stage.classList.add("is-playing");
        // Video ilk kez oynamaya başladığında bulanık arka plan videosunu
        // göster (kapak resminden video görüntüsüne yumuşak geçiş yapar).
        ytPlayerHost.classList.add("video-ready");
      } else if (e.data === YT.PlayerState.PAUSED) {
        isPlaying = false;
        setPlayIcon(false);
        stopEqualizerTweens();
        stage.classList.remove("is-playing");
      } else if (e.data === YT.PlayerState.ENDED) {
        isPlaying = false;
        stopEqualizerTweens();
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
  if (!ytPlayer || !ytPlayer.getCurrentTime || isSeeking) return;
  const dur = ytPlayer.getDuration() || 0;
  const cur = ytPlayer.getCurrentTime() || 0;
  if (dur > 0) {
    seekBar.max = String(dur);
    durTimeEl.textContent = formatTime(dur);
  }
  seekBar.value = String(cur);
  curTimeEl.textContent = formatTime(cur);
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
  const url = new URL(window.location.href);
  url.searchParams.set("v", current.id);
  url.searchParams.set("t", current.title);
  url.searchParams.set("c", current.channel);
  window.history.replaceState({}, "", url);

  applyTrackMeta(current);
  lyricsStatus.textContent = "Sözler yükleniyor...";
  lyricsStatus.classList.remove("hidden");
  lyricsContent.innerHTML = "";
  loadLyrics(current);
  renderQueuePanel();

  seekBar.value = "0";
  seekBar.max = "100";
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
// Sıra: 1) lyrics.ovh   2) lrclib.net (bulamazsa)
// TODO: YouTube altyazılarından (captions) üçüncü bir yedek eklemek
// mümkün ama bunun için sunucu tarafı bir proxy gerekir — YouTube'un
// timedtext uç noktası CORS'a kapalı ve üçüncü taraf kullanımına uygun
// belgelenmiş bir API değil, o yüzden statik bu sitede yapılamıyor.
async function fetchFromLyricsOvh(artist, title) {
  const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.lyrics ? data.lyrics.trim() : null;
}

async function fetchFromLrclibGet(artist, title) {
  const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

// /api/get tam eşleşme ister ve YouTube başlıklarından türetilen artist/title
// çiftleri nadiren birebir tutar; bu yüzden çoğu şarkıda sonuç boş dönüyordu.
// /api/search esnek arama yapar, bulamadığında buna düşüyoruz.
async function fetchFromLrclibSearch(artist, title) {
  const url = `https://lrclib.net/api/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const results = await res.json();
  if (!Array.isArray(results) || !results.length) return null;
  return results.find(r => r.syncedLyrics) || results[0];
}

async function fetchLrclibResult(artist, title) {
  let data = null;
  try {
    data = await fetchFromLrclibGet(artist, title);
  } catch {
    /* sessiz geç */
  }
  if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
    try {
      data = await fetchFromLrclibSearch(artist, title);
    } catch {
      /* sessiz geç */
    }
  }
  return data;
}

function renderSyncedLyrics(lines) {
  syncedLyrics = lines;
  lyricsCurrentIndex = -1;
  lyricsStatus.classList.add("hidden");
  lyricsContainerOuter.classList.remove("lyrics-plain-mode");
  lyricsContainerOuter.classList.add("lyrics-synced-mode");
  lyricsContent.innerHTML = `<p class="lyrics-current-line" id="lyricsCurrentLine"></p>`;
}

function renderPlainLyrics(text) {
  syncedLyrics = null;
  lyricsCurrentIndex = -1;
  lyricsStatus.classList.add("hidden");
  lyricsContainerOuter.classList.remove("lyrics-synced-mode");
  lyricsContainerOuter.classList.add("lyrics-plain-mode");
  lyricsContent.innerHTML = text
    .split("\n")
    .map(line => `<p>${escapeHtml(line) || "&nbsp;"}</p>`)
    .join("");
}

// Şu anki oynatma zamanına göre aktif satırı bulur ve tek satırlık
// gösterimi Spotify tarzı kayarak/solarak günceller. updateProgress()
// içinden çağrılır.
function updateActiveLyricLine(currentTime) {
  if (!syncedLyrics || !syncedLyrics.length) return;
  let idx = -1;
  for (let i = 0; i < syncedLyrics.length; i++) {
    if (syncedLyrics[i].time <= currentTime + 0.15) idx = i;
    else break;
  }
  if (idx === lyricsCurrentIndex) return;
  lyricsCurrentIndex = idx;

  const lineEl = document.getElementById("lyricsCurrentLine");
  if (!lineEl) return;
  const nextText = idx >= 0 ? (syncedLyrics[idx].text || "♪") : "";

  const applyText = () => { lineEl.textContent = nextText; };

  if (window.gsap) {
    gsap.killTweensOf(lineEl);
    gsap.to(lineEl, {
      opacity: 0,
      y: -16,
      duration: 0.18,
      ease: "power1.in",
      onComplete: () => {
        applyText();
        gsap.fromTo(lineEl, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.32, ease: "power2.out" });
      },
    });
  } else {
    lineEl.style.opacity = "0";
    setTimeout(() => {
      applyText();
      lineEl.style.opacity = "1";
    }, 120);
  }
}

async function loadLyrics(track) {
  const candidates = buildLyricsQueryCandidates(track.title, track.channel);
  syncedLyrics = null;
  lyricsCurrentIndex = -1;

  if (!candidates.length) {
    lyricsStatus.classList.remove("hidden");
    lyricsStatus.textContent = "Sözler bulunamadı.";
    lyricsContent.innerHTML = "";
    return;
  }

  lyricsStatus.classList.remove("hidden");
  lyricsStatus.textContent = "Sözler yükleniyor...";
  lyricsContent.innerHTML = "";

  for (const { artist, title } of candidates) {
    // 1) lrclib: senkron söz sağlayan asıl kaynak, önce bunu dene
    try {
      const data = await fetchLrclibResult(artist, title);
      if (data && data.syncedLyrics) {
        const parsed = parseLRC(data.syncedLyrics);
        if (parsed.length) { renderSyncedLyrics(parsed); return; }
      }
      if (data && data.plainLyrics) {
        renderPlainLyrics(data.plainLyrics.trim());
        return;
      }
    } catch {
      /* sessiz geç */
    }

    // 2) lyrics.ovh: sadece düz söz verir, lrclib'de hiçbir şey
    // bulunamazsa yedek olarak devreye girer
    lyricsStatus.textContent = "Sözler aranıyor...";
    try {
      const lyrics = await fetchFromLyricsOvh(artist, title);
      if (lyrics) { renderPlainLyrics(lyrics); return; }
    } catch {
      /* sessiz geç, bir sonraki adayı dene */
    }
  }

  lyricsStatus.classList.remove("hidden");
  lyricsStatus.textContent = "Bu şarkı için söz bulunamadı.";
  lyricsContent.innerHTML = "";
}

// ================= HUD Otomatik Gizleme =================
// Fare belirli bir süre hareket etmezse kontrol arayüzü (HUD) otomatik
// gizlenir; herhangi bir harekette veya dokunmada tekrar görünür.
let hudTimeout = null;
function showHud() {
  document.body.classList.remove("hud-hidden");
  scheduleHudHide();
}
function scheduleHudHide() {
  clearTimeout(hudTimeout);
  hudTimeout = setTimeout(() => {
    if (queuePanel.classList.contains("open")) return;
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
  applyTrackMeta(current);
  renderQueuePanel();
  loadLyrics(current);
  initPlayer();
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
  });
  seekBar.addEventListener("change", commitSeek);
  seekBar.addEventListener("pointerup", commitSeek);
  seekBar.addEventListener("touchend", commitSeek);

  queueToggleBtn.addEventListener("click", () => {
    if (queuePanel.classList.contains("open")) closeQueuePanel();
    else openQueuePanel();
  });
  queueCloseBtn.addEventListener("click", closeQueuePanel);

  // "Geri Dön": müziği kesmeden mini oynatıcıya devret
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
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.code === "ArrowRight") seekRelative(5);
    else if (e.code === "ArrowLeft") seekRelative(-5);
  });
}

init();
