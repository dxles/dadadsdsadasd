const params = new URLSearchParams(window.location.search);
const videoId = params.get("v");
const rawTitle = params.get("t") || "Bilinmeyen Şarkı";
const channel = params.get("c") || "";

document.getElementById("trackTitle").textContent = rawTitle;
document.getElementById("trackChannel").textContent = channel;
document.getElementById("coverImg").src = videoId
  ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  : "";

let ytPlayer = null;
let isPlaying = false;
let duration = 0;
let seeking = false;
let syncedLyrics = null; // [{time: seconds, text: string}]
let currentLineIndex = -1;
let repeatOn = false;
let shuffleOn = false;

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
const coverWrap = document.querySelector(".cover-wrap");
const equalizer = document.getElementById("equalizer");
const eqBars = equalizer ? equalizer.querySelectorAll("span") : [];

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---- GSAP giriş animasyonu ----
if (window.gsap) {
  const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
  tl.to(".back-link", { opacity: 1, duration: 0.4 })
    .fromTo(".cover-wrap", { opacity: 0, y: 16, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.55 }, "-=0.2")
    .fromTo(".track-info", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4 }, "-=0.3")
    .fromTo(".progress-area", { opacity: 0 }, { opacity: 1, duration: 0.35 }, "-=0.2")
    .fromTo(".controls", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35 }, "-=0.2")
    .fromTo(".lyrics-box", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45 }, "-=0.15");

  // Kapak sürükle/döndür — sadece küçük, geri yaylanan bir etkileşim
  if (window.Draggable) {
    Draggable.create(coverWrap, {
      type: "rotation",
      inertia: false,
      onDragEnd: function () {
        gsap.to(coverWrap, { rotation: 0, duration: 0.6, ease: "elastic.out(1, 0.4)" });
      },
    });
  }

  // Play butonuna basınca hafif "tık" tepkisi
  if (window.Observer) {
    Observer.create({
      target: playBtn,
      type: "pointer",
      onPress: () => gsap.to(playBtn, { scale: 0.9, duration: 0.12, ease: "power1.out" }),
      onRelease: () => gsap.to(playBtn, { scale: 1, duration: 0.3, ease: "back.out(2)" }),
    });
  }
}

// ---- Equalizer animasyonu ----
let eqTweens = [];
function startEqualizer() {
  if (!window.gsap || !eqBars.length) return;
  stopEqualizer();
  gsap.to(equalizer, { opacity: 1, duration: 0.25 });
  eqBars.forEach((bar, i) => {
    const tw = gsap.to(bar, {
      height: () => 6 + Math.random() * 14,
      duration: 0.35 + Math.random() * 0.25,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      delay: i * 0.05,
    });
    eqTweens.push(tw);
  });
}

function stopEqualizer() {
  eqTweens.forEach(t => t.kill());
  eqTweens = [];
  if (window.gsap) {
    gsap.to(equalizer, { opacity: 0, duration: 0.25 });
    eqBars.forEach(bar => gsap.to(bar, { height: 4, duration: 0.2 }));
  }
}

// ---- YouTube player kurulumu ----
if (videoId) {
  createYtPlayer("ytPlayerHost", videoId, {
    onReady: () => {
      startProgressLoop();
    },
    onStateChange: (e) => {
      if (e.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        playBtn.textContent = "❚❚";
        startEqualizer();
      } else if (e.data === YT.PlayerState.PAUSED) {
        isPlaying = false;
        playBtn.textContent = "▶";
        stopEqualizer();
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

    // Süre YouTube'dan geç gelebilir; her tick'te kontrol edip yakala.
    const d = ytPlayer.getDuration();
    if (d && d !== duration) {
      duration = d;
      durTimeEl.textContent = formatTime(duration);
    }

    if (seeking) return;

    const t = ytPlayer.getCurrentTime();
    curTimeEl.textContent = formatTime(t);
    if (duration > 0) {
      seekBar.value = (t / duration) * 100;
    }
    updateActiveLyric(t);
  }, 250);
}

// ---- Kontroller ----
playBtn.addEventListener("click", () => {
  if (!ytPlayer) return;
  if (isPlaying) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
});

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
  const t = (seekBar.value / 100) * duration;
  curTimeEl.textContent = formatTime(t);
});

seekBar.addEventListener("change", () => {
  if (!ytPlayer || !duration) { seeking = false; return; }
  const t = (seekBar.value / 100) * duration;
  ytPlayer.seekTo(t, true);
  seeking = false;
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

  // Üstte ve altta boşluk dolgusu: ilk/son satır da ortalanabilsin diye.
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
    const wasActive = el.classList.contains("active");
    el.classList.remove("active", "near");
    if (lineIdx === idx) {
      el.classList.add("active");
      if (window.gsap && !wasActive) {
        gsap.fromTo(el, { scale: 0.96 }, { scale: 1.04, duration: 0.35, ease: "power2.out" });
      }
    } else if (Math.abs(lineIdx - idx) === 1) {
      el.classList.add("near");
      if (window.gsap) gsap.to(el, { scale: 0.98, duration: 0.35, ease: "power2.out" });
    } else if (window.gsap) {
      gsap.to(el, { scale: 0.96, duration: 0.35, ease: "power2.out" });
    }
  });

  if (idx >= 0 && lyricsViewport) {
    const activeEl = lyricsContent.querySelector(`[data-index="${idx}"]`);
    if (activeEl) {
      // Aktif satırı viewport'un ortasına kaydır (Spotify/Apple Music tarzı)
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
    // Önce sanatçı + şarkı adıyla dene, sonuç yoksa sadece şarkı adıyla dene.
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
