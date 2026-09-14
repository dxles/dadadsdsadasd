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

const playBtn = document.getElementById("playBtn");
const backBtn = document.getElementById("backBtn");
const fwdBtn = document.getElementById("fwdBtn");
const seekBar = document.getElementById("seekBar");
const curTimeEl = document.getElementById("curTime");
const durTimeEl = document.getElementById("durTime");
const lyricsStatus = document.getElementById("lyricsStatus");
const lyricsContent = document.getElementById("lyricsContent");

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---- YouTube player kurulumu ----
if (videoId) {
  createYtPlayer("ytPlayerHost", videoId, {
    onReady: () => {
      duration = ytPlayer.getDuration();
      durTimeEl.textContent = formatTime(duration);
      startProgressLoop();
    },
    onStateChange: (e) => {
      if (e.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        playBtn.textContent = "❚❚";
        if (!duration) {
          duration = ytPlayer.getDuration();
          durTimeEl.textContent = formatTime(duration);
        }
      } else if (e.data === YT.PlayerState.PAUSED) {
        isPlaying = false;
        playBtn.textContent = "▶";
      } else if (e.data === YT.PlayerState.ENDED) {
        isPlaying = false;
        playBtn.textContent = "▶";
      }
    },
  }).then((player) => {
    ytPlayer = player;
  });
} else {
  lyricsStatus.textContent = "Geçersiz şarkı.";
}

function startProgressLoop() {
  setInterval(() => {
    if (!ytPlayer || seeking) return;
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

seekBar.addEventListener("input", () => {
  seeking = true;
  const t = (seekBar.value / 100) * duration;
  curTimeEl.textContent = formatTime(t);
});

seekBar.addEventListener("change", () => {
  if (!ytPlayer) return;
  const t = (seekBar.value / 100) * duration;
  ytPlayer.seekTo(t, true);
  seeking = false;
});

// ---- Lyrics: lrclib.net ----
function cleanTitleForSearch(title) {
  // "Sanatçı - Şarkı (Official Video)" gibi kalıplardan gereksiz kısımları temizle
  return title
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/official\s*(video|audio|music video)?/gi, "")
    .replace(/lyrics?/gi, "")
    .replace(/hd|hq|4k/gi, "")
    .trim();
}

function parseArtistAndTrack(title) {
  const cleaned = cleanTitleForSearch(title);
  const parts = cleaned.split(/[-–—]/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), track: parts.slice(1).join(" ").trim() };
  }
  return { artist: channel, track: cleaned };
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
}

function renderPlainLyrics(text) {
  lyricsContent.innerHTML = `<div class="lyric-plain"></div>`;
  lyricsContent.querySelector(".lyric-plain").textContent = text;
}

function updateActiveLyric(currentTime) {
  if (!syncedLyrics || !syncedLyrics.length) return;

  let idx = -1;
  for (let i = 0; i < syncedLyrics.length; i++) {
    if (syncedLyrics[i].time <= currentTime) {
      idx = i;
    } else {
      break;
    }
  }

  if (idx !== currentLineIndex) {
    currentLineIndex = idx;
    const prevActive = lyricsContent.querySelector(".lyric-line.active");
    if (prevActive) prevActive.classList.remove("active");
    if (idx >= 0) {
      const el = lyricsContent.querySelector(`[data-index="${idx}"]`);
      if (el) {
        el.classList.add("active");
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }
}

async function fetchLyrics() {
  const { artist, track } = parseArtistAndTrack(rawTitle);

  if (!track) {
    lyricsStatus.textContent = "Söz bulunamadı.";
    return;
  }

  lyricsStatus.textContent = "Sözler yükleniyor...";

  try {
    const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(track)}&artist_name=${encodeURIComponent(artist)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("lrclib isteği başarısız");
    const results = await res.json();

    if (!results || !results.length) {
      lyricsStatus.textContent = "Bu şarkı için söz bulunamadı.";
      return;
    }

    // Senkronize sözü olan ilk sonucu tercih et
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
