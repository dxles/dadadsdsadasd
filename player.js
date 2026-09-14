function initPlayerPage() {

const params = new URLSearchParams(window.location.search);
const videoId = params.get("v");
const rawTitle = params.get("t") || "Bilinmeyen Şarkı";
const channel = params.get("c") || "";

const NOWPLAYING_KEY = "cinla_now_playing";

const coverUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";

document.getElementById("trackTitle").textContent = rawTitle;
document.getElementById("trackChannel").textContent = channel;
document.getElementById("coverImg").src = coverUrl;
document.getElementById("bgBlur").style.backgroundImage = coverUrl ? `url(${coverUrl})` : "none";

let ytPlayer = null;
let isPlaying = false;
let duration = 0;
let seeking = false;
let syncedLyrics = null; // [{time: seconds, text: string}]
let currentLineIndex = -1;
let repeatOn = false;
let shuffleOn = false;
let videoModeOn = false;
let isMuted = false;
let lastVolume = 100;
let startAt = 0; // localStorage'dan devralınan kaldığı saniye

const playBtn = document.getElementById("playBtn");
const backBtn = document.getElementById("backBtn");
const fwdBtn = document.getElementById("fwdBtn");
const repeatBtn = document.getElementById("repeatBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const seekBar = document.getElementById("seekBar");
const curTimeEl = document.getElementById("curTime");
const durTimeEl = document.getElementById("durTime");
const lyricsStatus = document.getElementById("lyricsStatus");
const lyricsContent = document.getElementById("lyricsContent");
const lyricsViewport = document.getElementById("lyricsViewport");
const equalizer = document.getElementById("equalizer");
const eqBars = equalizer ? equalizer.querySelectorAll("span") : [];
const coverWrap = document.getElementById("coverWrap");
const videoToggleBtn = document.getElementById("videoToggleBtn");
const videoHideBtn = document.getElementById("videoHideBtn");
const videoStage = document.getElementById("videoStage");
const videoFrame = document.getElementById("videoFrame");
const ytPlayerHost = document.getElementById("ytPlayerHost");
const stage = document.getElementById("stage");
const backLink = document.getElementById("backLink");

const muteBtn = document.getElementById("muteBtn");
const volumeSlider = document.getElementById("volumeSlider");

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---- localStorage üzerinden "şu an çalıyor" durumu ----
// player.html sayfasından ayrılınca (Listeye dön) index.html bu bilgiyi
// okuyup kendi sağ-alt mini oynatıcısında müziği kaldığı yerden devam ettirir.
function readNowPlaying() {
  try {
    return JSON.parse(localStorage.getItem(NOWPLAYING_KEY) || "null");
  } catch {
    return null;
  }
}

function writeNowPlaying(extra = {}) {
  if (!videoId) return;
  const t = ytPlayer && ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : startAt;
  const data = {
    id: videoId,
    title: rawTitle,
    channel,
    progress: t || 0,
    isPlaying,
    volume: lastVolume,
    updatedAt: Date.now(),
    ...extra,
  };
  try {
    localStorage.setItem(NOWPLAYING_KEY, JSON.stringify(data));
  } catch {
    /* sessiz geç */
  }
}

function clearNowPlaying() {
  try {
    localStorage.removeItem(NOWPLAYING_KEY);
  } catch {
    /* sessiz geç */
  }
}

// Bu şarkı zaten index.html'in mini-player'ında çalıyorsa kaldığı yerden aç.
(function resumeFromNowPlaying() {
  const np = readNowPlaying();
  if (np && np.id === videoId && typeof np.progress === "number") {
    startAt = np.progress;
    if (typeof np.volume === "number") lastVolume = np.volume;
  }
})();

// ---- GSAP giriş animasyonu ----
if (window.gsap) {
  const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
  tl.to(".back-link", { opacity: 1, duration: 0.4 }, 0)
    .fromTo(".cover-col", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5 }, "-=0.15")
    .fromTo(".track-meta", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5 }, "-=0.35")
    .fromTo(".lyrics-box", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45 }, "-=0.3")
    .fromTo(".progress-area, .controls", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.05 }, "-=0.2");
}

// ---- Görsel equalizer (dans eden çubuklar) ----
// Not: YouTube iframe cross-origin olduğu için sitenin sesinden gerçek frekans
// verisi (Web Audio AnalyserNode) çekilemiyor. Bu yüzden bar'lar rastgele değil,
// çalma durumuna tepki veren, birbirini etkileyen "müzikal hissi" olan bir
// animasyon ile canlandırılıyor — gerçek ses analizi değil, görsel simülasyon.
let eqTweens = [];

function startEqualizer() {
  equalizer.classList.add("active");
  coverWrap.classList.add("pulsing");
  if (!window.gsap) return;
  stopEqualizerTweens();
  eqBars.forEach((bar, i) => {
    const tw = gsap.to(bar, {
      height: () => 6 + Math.random() * 26,
      duration: 0.28 + Math.random() * 0.25,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      delay: i * 0.05,
    });
    eqTweens.push(tw);
  });
}

function stopEqualizerTweens() {
  eqTweens.forEach(t => t.kill());
  eqTweens = [];
}

function stopEqualizer() {
  equalizer.classList.remove("active");
  coverWrap.classList.remove("pulsing");
  stopEqualizerTweens();
  if (window.gsap) {
    eqBars.forEach(bar => gsap.to(bar, { height: 6, duration: 0.2 }));
  }
}

// ---- YouTube player kurulumu ----
if (videoId) {
  createYtPlayer("ytPlayerHost", videoId, {
    onReady: (e) => {
      if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(lastVolume);
      volumeSlider.value = lastVolume;
      volumeSlider.style.setProperty("--vol-fill", lastVolume + "%");
      if (startAt > 0) {
        e.target.seekTo(startAt, true);
      }
      startProgressLoop();
    },
    onStateChange: (e) => {
      if (e.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        playBtn.textContent = "❚❚";
        startEqualizer();
        writeNowPlaying();
      } else if (e.data === YT.PlayerState.PAUSED) {
        isPlaying = false;
        playBtn.textContent = "▶";
        stopEqualizer();
        writeNowPlaying();
      } else if (e.data === YT.PlayerState.ENDED) {
        isPlaying = false;
        playBtn.textContent = "▶";
        stopEqualizer();
        handleTrackEnd();
      }
    },
  }).then((player) => {
    ytPlayer = player;
  });
} else {
  lyricsStatus.textContent = "Geçersiz şarkı.";
}

function handleTrackEnd() {
  if (repeatOn) {
    ytPlayer.seekTo(0, true);
    ytPlayer.playVideo();
    return;
  }
  if (shuffleOn) {
    playRandomFromLibrary();
    return;
  }
  clearNowPlaying();
}

// "Karıştır" açıkken şarkı bitince kütüphaneden rastgele birini çalar (varsa).
function playRandomFromLibrary() {
  try {
    const userSongs = JSON.parse(localStorage.getItem("cinla_user_songs") || "[]");
    const cached = JSON.parse(localStorage.getItem("cinla_cached_songs") || "null") || [];
    const pool = [...userSongs, ...cached].filter(s => s.id !== videoId);
    if (!pool.length) return;
    const next = pool[Math.floor(Math.random() * pool.length)];
    const url = `player.html?v=${encodeURIComponent(next.id)}&t=${encodeURIComponent(next.title)}&c=${encodeURIComponent(next.channel || "")}`;
    window.location.href = url;
  } catch {
    /* sessiz geç */
  }
}

function startProgressLoop() {
  setInterval(() => {
    if (!ytPlayer) return;

    const d = ytPlayer.getDuration();
    if (d && d !== duration) {
      duration = d;
      durTimeEl.textContent = formatTime(duration);
    }

    if (seeking) return;

    const t = ytPlayer.getCurrentTime();
    curTimeEl.textContent = formatTime(t);
    if (duration > 0) {
      const pct = (t / duration) * 100;
      seekBar.value = pct;
      seekBar.style.setProperty("--fill", pct + "%");
    }
    updateActiveLyric(t);

    if (isPlaying) writeNowPlaying();
  }, 1000);
}

// ---- Kontroller ----
function togglePlay() {
  if (!ytPlayer) return;
  if (isPlaying) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
}

playBtn.addEventListener("click", togglePlay);

backBtn.addEventListener("click", () => {
  if (!ytPlayer) return;
  const t = Math.max(0, ytPlayer.getCurrentTime() - 10);
  ytPlayer.seekTo(t, true);
});

fwdBtn.addEventListener("click", () => {
  if (!ytPlayer) return;
  const t = Math.min(duration, ytPlayer.getCurrentTime() + 10);
  ytPlayer.seekTo(t, true);
});

repeatBtn.addEventListener("click", () => {
  repeatOn = !repeatOn;
  repeatBtn.classList.toggle("active", repeatOn);
  if (repeatOn && shuffleOn) {
    shuffleOn = false;
    shuffleBtn.classList.remove("active");
  }
  if (window.gsap) gsap.fromTo(repeatBtn, { scale: 0.8 }, { scale: 1, duration: 0.3, ease: "back.out(3)" });
});

shuffleBtn.addEventListener("click", () => {
  shuffleOn = !shuffleOn;
  shuffleBtn.classList.toggle("active", shuffleOn);
  if (shuffleOn && repeatOn) {
    repeatOn = false;
    repeatBtn.classList.remove("active");
  }
  if (window.gsap) gsap.fromTo(shuffleBtn, { scale: 0.8 }, { scale: 1, duration: 0.3, ease: "back.out(3)" });
});

seekBar.addEventListener("input", () => {
  if (!duration) return;
  seeking = true;
  seekBar.style.setProperty("--fill", seekBar.value + "%");
  const t = (seekBar.value / 100) * duration;
  curTimeEl.textContent = formatTime(t);
});

seekBar.addEventListener("change", () => {
  if (!ytPlayer || !duration) { seeking = false; return; }
  const t = (seekBar.value / 100) * duration;
  ytPlayer.seekTo(t, true);
  seeking = false;
  writeNowPlaying();
});

// ---- Ses aç/kapa + seviye ----
function applyVolume(vol) {
  if (!ytPlayer || !ytPlayer.setVolume) return;
  ytPlayer.setVolume(vol);
  volumeSlider.style.setProperty("--vol-fill", vol + "%");
  muteBtn.textContent = vol === 0 ? "🔇" : vol < 50 ? "🔉" : "🔊";
}

volumeSlider.addEventListener("input", () => {
  const vol = Number(volumeSlider.value);
  isMuted = vol === 0;
  lastVolume = vol || lastVolume;
  applyVolume(vol);
  writeNowPlaying();
});

muteBtn.addEventListener("click", () => {
  isMuted = !isMuted;
  if (isMuted) {
    lastVolume = Number(volumeSlider.value) || lastVolume;
    volumeSlider.value = 0;
    applyVolume(0);
  } else {
    volumeSlider.value = lastVolume || 100;
    applyVolume(lastVolume || 100);
  }
  writeNowPlaying();
});

// ---- Video göster / gizle (gerçek YouTube videosu, letterbox) ----
function enterVideoMode() {
  videoModeOn = true;
  videoFrame.appendChild(ytPlayerHost);
  ytPlayerHost.classList.add("video-mode");
  videoStage.classList.remove("hidden");
  if (window.gsap) {
    gsap.fromTo(videoStage, { opacity: 0 }, { opacity: 1, duration: 0.25 });
  }
}

function exitVideoMode() {
  videoModeOn = false;
  document.body.appendChild(ytPlayerHost);
  ytPlayerHost.classList.remove("video-mode");
  videoStage.classList.add("hidden");
}

videoToggleBtn.addEventListener("click", enterVideoMode);
videoHideBtn.addEventListener("click", exitVideoMode);

// ---- "Listeye dön": mevcut çalma durumunu (şarkı, saniye, ses) localStorage'a
// kaydeder ve index.html'e gider. index.html açılınca bu bilgiyi okuyup sağ
// altta mini oynatıcı olarak müziği kaldığı yerden çalmaya devam eder. ----
backLink.addEventListener("click", (e) => {
  e.preventDefault();
  writeNowPlaying({ progress: ytPlayer ? ytPlayer.getCurrentTime() : startAt });

  if (window.gsap) {
    gsap.to(stage, {
      opacity: 0,
      scale: 0.98,
      duration: 0.2,
      ease: "power1.in",
      onComplete: () => { window.location.href = "index.html"; },
    });
  } else {
    window.location.href = "index.html";
  }
});

// Sekme kapatılırken / sayfadan ayrılırken de son durumu yazmayı dene.
window.addEventListener("pagehide", () => {
  if (videoId) writeNowPlaying({ progress: ytPlayer ? ytPlayer.getCurrentTime() : startAt });
});

// ---- Lyrics: lrclib.net ----
function cleanTitleForSearch(title) {
  return title
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/official\s*(video|audio|music video)?/gi, "")
    .replace(/lyrics?/gi, "")
    .replace(/hd|hq|4k/gi, "")
    .trim();
}

function cleanChannelForArtist(name) {
  // YouTube'un otomatik sanatçı kanalları "İsim - Topic" şeklinde gelir.
  return (name || "").replace(/\s*-\s*Topic\s*$/i, "").trim();
}

function parseArtistAndTrack(title) {
  const cleaned = cleanTitleForSearch(title);
  const parts = cleaned.split(/[-–—]/);
  const cleanChannel = cleanChannelForArtist(channel);
  if (parts.length >= 2) {
    return { artist: parts[0].trim() || cleanChannel, track: parts.slice(1).join(" ").trim() };
  }
  return { artist: cleanChannel, track: cleaned };
}

function parseLRC(lrcText) {
  const lines = lrcText.split("\n");
  const result = [];
  const timeTag = /\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  lines.forEach((line) => {
    const matches = [...line.matchAll(timeTag)];
    if (!matches.length) return;
    const text = line.replace(timeTag, "").trim();
    matches.forEach((m) => {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const ms = m[3] ? parseInt(m[3].padEnd(3, "0"), 10) : 0;
      const time = min * 60 + sec + ms / 1000;
      result.push({ time, text });
    });
  });

  return result.sort((a, b) => a.time - b.time);
}

function renderSyncedLyrics(lines) {
  lyricsContent.innerHTML = "";

  const padTop = document.createElement("div");
  padTop.className = "lyric-pad";
  lyricsContent.appendChild(padTop);

  lines.forEach((line, i) => {
    const div = document.createElement("div");
    div.className = "lyric-line";
    div.dataset.index = i;
    div.textContent = line.text || "♪";
    div.addEventListener("click", () => {
      if (ytPlayer) ytPlayer.seekTo(line.time, true);
    });
    lyricsContent.appendChild(div);
  });

  const padBottom = document.createElement("div");
  padBottom.className = "lyric-pad";
  lyricsContent.appendChild(padBottom);
}

function renderPlainLyrics(text) {
  lyricsContent.innerHTML = `<div class="lyric-plain"></div>`;
  lyricsContent.querySelector(".lyric-plain").textContent = text;
}

function updateActiveLyric(currentTime) {
  if (!syncedLyrics || !syncedLyrics.length) return;

  let idx = -1;
  for (let i = 0; i < syncedLyrics.length; i++) {
    if (syncedLyrics[i].time <= currentTime + 0.15) {
      idx = i;
    } else {
      break;
    }
  }

  if (idx === currentLineIndex) return;
  currentLineIndex = idx;

  const allLines = lyricsContent.querySelectorAll(".lyric-line");
  allLines.forEach((el) => {
    const lineIdx = parseInt(el.dataset.index, 10);
    el.classList.remove("active", "near");
    if (lineIdx === idx) {
      el.classList.add("active");
    } else if (Math.abs(lineIdx - idx) === 1) {
      el.classList.add("near");
    }
  });

  if (idx >= 0 && lyricsViewport) {
    const activeEl = lyricsContent.querySelector(`[data-index="${idx}"]`);
    if (activeEl) {
      const offset = activeEl.offsetTop - (lyricsViewport.clientHeight / 2) + (activeEl.clientHeight / 2);
      lyricsViewport.scrollTo({ top: offset, behavior: "smooth" });
    }
  }
}

async function searchLrclib(track, artist) {
  const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(track)}${artist ? `&artist_name=${encodeURIComponent(artist)}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("lrclib isteği başarısız");
  return res.json();
}

async function fetchLyrics() {
  const { artist, track } = parseArtistAndTrack(rawTitle);

  if (!track) {
    lyricsStatus.textContent = "Söz bulunamadı.";
    return;
  }

  lyricsStatus.textContent = "Sözler yükleniyor...";

  try {
    let results = await searchLrclib(track, artist);
    if (!results || !results.length) {
      results = await searchLrclib(track, "");
    }

    if (!results || !results.length) {
      lyricsStatus.textContent = "Bu şarkı için söz bulunamadı.";
      return;
    }

    const withSynced = results.find(r => r.syncedLyrics);
    const best = withSynced || results[0];

    if (best.syncedLyrics) {
      syncedLyrics = parseLRC(best.syncedLyrics);
      lyricsStatus.textContent = "";
      renderSyncedLyrics(syncedLyrics);
    } else if (best.plainLyrics) {
      lyricsStatus.textContent = "";
      renderPlainLyrics(best.plainLyrics);
    } else {
      lyricsStatus.textContent = "Bu şarkı için söz bulunamadı.";
    }
  } catch (err) {
    lyricsStatus.textContent = "Sözler alınamadı.";
  }
}

fetchLyrics();

} // initPlayerPage sonu

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPlayerPage);
} else {
  initPlayerPage();
}
