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

// Şarkı sözü aramaları için sanatçı/şarkı adını temizle
function cleanForLyrics(str) {
  return (str || "")
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/official.*video/gi, "")
    .replace(/official.*audio/gi, "")
    .replace(/lyrics?/gi, "")
    .replace(/\bft\.?\b.*/gi, "")
    .replace(/\bfeat\.?\b.*/gi, "")
    .replace(/[-–—]\s*$/g, "")
    .trim();
}

// ================= DOM =================
const stage = document.getElementById("stage");
const bgBlur = document.getElementById("bgBlur");
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
const backLink = document.getElementById("backLink");

const videoToggleBtn = document.getElementById("videoToggleBtn");
const videoHideBtn = document.getElementById("videoHideBtn");
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
      durTimeEl.textContent = "0:00";
      progressInterval = setInterval(updateProgress, 500);
    },
    onStateChange: (e) => {
      if (e.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        setPlayIcon(true);
        startEqualizer();
        stage.classList.add("is-playing");
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
    seekBar.max = dur;
    seekBar.value = cur;
    durTimeEl.textContent = formatTime(dur);
  }
  curTimeEl.textContent = formatTime(cur);

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
  if (progressInterval) clearInterval(progressInterval);
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

  if (ytPlayer && ytPlayer.loadVideoById) {
    ytPlayer.loadVideoById(current.id);
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
async function loadLyrics(track) {
  const artist = cleanForLyrics(track.channel);
  const title = cleanForLyrics(track.title);

  if (!artist && !title) {
    lyricsStatus.textContent = "Sözler bulunamadı.";
    return;
  }

  try {
    const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
    if (!res.ok) throw new Error("no-lyrics");
    const data = await res.json();
    if (!data.lyrics) throw new Error("no-lyrics");

    lyricsStatus.classList.add("hidden");
    lyricsContent.innerHTML = data.lyrics
      .split("\n")
      .map(line => `<p>${escapeHtml(line) || "&nbsp;"}</p>`)
      .join("");
  } catch {
    lyricsStatus.classList.remove("hidden");
    lyricsStatus.textContent = "Bu şarkı için söz bulunamadı.";
    lyricsContent.innerHTML = "";
  }
}

// ================= Video Modu =================
function showVideo() {
  document.body.classList.add("video-active");
}
function hideVideo() {
  document.body.classList.remove("video-active");
}

// ================= HUD Otomatik Gizleme =================
// "Videoyu Göster" butonuna tıklanmadan da, fare belirli bir süre
// hareket etmezse kontrol arayüzü (HUD) otomatik gizlenir; herhangi bir
// harekette veya dokunmada tekrar görünür. Bu davranış ayrı bir butona
// bağlı değildir.
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

  seekBar.addEventListener("mousedown", () => { isSeeking = true; });
  seekBar.addEventListener("touchstart", () => { isSeeking = true; });
  seekBar.addEventListener("input", () => {
    curTimeEl.textContent = formatTime(Number(seekBar.value));
  });
  seekBar.addEventListener("change", () => {
    if (ytPlayer) ytPlayer.seekTo(Number(seekBar.value), true);
    isSeeking = false;
  });

  videoToggleBtn.addEventListener("click", showVideo);
  videoHideBtn.addEventListener("click", hideVideo);

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
