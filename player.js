function initPlayerPage() {
  const params = new URLSearchParams(window.location.search);
  const videoId = params.get("v");
  const rawTitle = params.get("t") || "Bilinmeyen Şarkı";
  const channel = params.get("c") || "";

  const NOWPLAYING_KEY = "cinla_now_playing";
  const coverUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";

  // HTML Elementleri Bağlantıları
  const trackTitleEl = document.getElementById("trackTitle");
  const trackChannelEl = document.getElementById("trackChannel");
  const coverImgEl = document.getElementById("coverImg");
  const bgBlurEl = document.getElementById("bgBlur");
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
  const lyricsContainerOuter = document.getElementById("lyricsContainerOuter");
  const equalizer = document.getElementById("equalizer");
  const eqBars = equalizer ? equalizer.querySelectorAll("span") : [];
  const videoToggleBtn = document.getElementById("videoToggleBtn");
  const videoHideBtn = document.getElementById("videoHideBtn");
  const videoFrame = document.getElementById("videoFrame");
  const ytPlayerHost = document.getElementById("ytPlayerHost");
  const stage = document.getElementById("stage");
  const backLink = document.getElementById("backLink");
  const muteBtn = document.getElementById("muteBtn");
  const volumeSlider = document.getElementById("volumeSlider");

  if (trackTitleEl) trackTitleEl.textContent = rawTitle;
  if (trackChannelEl) trackChannelEl.textContent = channel;
  if (coverImgEl) coverImgEl.src = coverUrl;
  if (bgBlurEl) bgBlurEl.style.backgroundImage = coverUrl ? `url(${coverUrl})` : "none";

  let ytPlayer = null;
  let isPlaying = false;
  let duration = 0;
  let seeking = false;
  let syncedLyrics = null; 
  let currentLineIndex = -1;
  let repeatOn = false;
  let shuffleOn = false;
  let videoModeOn = false;
  let isMuted = false;
  let lastVolume = 100;
  let startAt = 0;

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // ---- LocalStorage Yönetimi (Şimdi Çalıyor Devamlılığı) ----
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
    } catch {}
  }

  function clearNowPlaying() {
    try {
      localStorage.removeItem(NOWPLAYING_KEY);
    } catch {}
  }

  (function resumeFromNowPlaying() {
    const np = readNowPlaying();
    if (np && np.id === videoId && typeof np.progress === "number") {
      startAt = np.progress;
      if (typeof np.volume === "number") lastVolume = np.volume;
    }
  })();

  // ---- GSAP Giriş Animasyonu ----
  if (window.gsap) {
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.to(".back-link", { opacity: 1, duration: 0.4 }, 0)
      .fromTo(".now-row", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5 }, "-=0.2")
      .fromTo(".controls", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4 }, "-=0.25");
  }

  // ---- Equalizer & Bass Simülasyonu ----
  let eqTweens = [];
  let bassInterval = null;

  function simulateBassPulse() {
    if (!isPlaying || document.body.classList.contains("video-active")) return;
    const isBigBeat = Math.random() < 0.3;
    const bassLevel = isBigBeat ? (Math.random() * 0.4 + 0.6) : (Math.random() * 0.2 + 0.4);
    const scaleFactor = 1 - (1 - bassLevel) * 0.01;
    const coverWrap = document.getElementById("coverWrap");
    if (coverWrap) coverWrap.style.transform = `scale(${scaleFactor})`;
  }

  function startEqualizer() {
    if (equalizer) equalizer.classList.add("active");
    if (bassInterval) clearInterval(bassInterval);
    bassInterval = setInterval(simulateBassPulse, 60);
    if (!window.gsap) return;
    stopEqualizerTweens();
    eqBars.forEach((bar, i) => {
      const tw = gsap.to(bar, {
        height: () => 5 + Math.random() * 25,
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
    if (equalizer) equalizer.classList.remove("active");
    if (bassInterval) { clearInterval(bassInterval); bassInterval = null; }
    const coverWrap = document.getElementById("coverWrap");
    if (coverWrap) coverWrap.style.transform = "scale(1)";
    stopEqualizerTweens();
    if (window.gsap) {
      eqBars.forEach(bar => gsap.to(bar, { height: 5, duration: 0.2 }));
    }
  }

  // ---- YouTube Player Kurulumu ----
  if (videoId && typeof createYtPlayer === "function") {
    createYtPlayer("ytPlayerHost", videoId, {
      onReady: (e) => {
        if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(lastVolume);
        if (volumeSlider) {
          volumeSlider.value = lastVolume;
          volumeSlider.style.setProperty("--vol-fill", lastVolume + "%");
        }
        if (startAt > 0) {
          e.target.seekTo(startAt, true);
        }
        startProgressLoop();
      },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING) {
          isPlaying = true;
          if (playBtn) playBtn.textContent = "❚❚";
          startEqualizer();
          writeNowPlaying();
        } else if (e.data === YT.PlayerState.PAUSED) {
          isPlaying = false;
          if (playBtn) playBtn.textContent = "▶";
          stopEqualizer();
          writeNowPlaying();
        } else if (e.data === YT.PlayerState.ENDED) {
          isPlaying = false;
          if (playBtn) playBtn.textContent = "▶";
          stopEqualizer();
          handleTrackEnd();
        }
      },
    }).then((player) => {
      ytPlayer = player;
    });
  } else {
    if (lyricsStatus) lyricsStatus.textContent = "Geçersiz şarkı veya oynatıcı yüklenemedi.";
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

  function playRandomFromLibrary() {
    try {
      const userSongs = JSON.parse(localStorage.getItem("cinla_user_songs") || "[]");
      const cached = JSON.parse(localStorage.getItem("cinla_cached_songs") || "null") || [];
      const pool = [...userSongs, ...cached].filter(s => s.id !== videoId);
      if (!pool.length) return;
      const next = pool[Math.floor(Math.random() * pool.length)];
      const url = `player.html?v=${encodeURIComponent(next.id)}&t=${encodeURIComponent(next.title)}&c=${encodeURIComponent(next.channel || "")}`;
      window.location.href = url;
    } catch {}
  }

  function startProgressLoop() {
    setInterval(() => {
      if (!ytPlayer) return;

      const d = ytPlayer.getDuration();
      if (d && d !== duration) {
        duration = d;
        if (durTimeEl) durTimeEl.textContent = formatTime(duration);
      }

      if (seeking) return;

      const t = ytPlayer.getCurrentTime();
      if (curTimeEl) curTimeEl.textContent = formatTime(t);
      if (duration > 0 && seekBar) {
        const pct = (t / duration) * 100;
        seekBar.value = pct;
        seekBar.style.setProperty("--fill", pct + "%");
      }
      updateActiveLyric(t);

      if (isPlaying) writeNowPlaying();
    }, 1000);
  }

  // ---- Kontrol Butonları & Dinleyiciler ----
  function togglePlay() {
    if (!ytPlayer) return;
    if (isPlaying) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
  }

  if (playBtn) playBtn.addEventListener("click", togglePlay);

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      if (!ytPlayer) return;
      const t = Math.max(0, ytPlayer.getCurrentTime() - 10);
      ytPlayer.seekTo(t, true);
    });
  }

  if (fwdBtn) {
    fwdBtn.addEventListener("click", () => {
      if (!ytPlayer) return;
      const t = Math.min(duration, ytPlayer.getCurrentTime() + 10);
      ytPlayer.seekTo(t, true);
    });
  }

  if (repeatBtn) {
    repeatBtn.addEventListener("click", () => {
      repeatOn = !repeatOn;
      repeatBtn.classList.toggle("active", repeatOn);
      if (repeatOn && shuffleOn) {
        shuffleOn = false;
        if (shuffleBtn) shuffleBtn.classList.remove("active");
      }
      if (window.gsap) gsap.fromTo(repeatBtn, { scale: 0.8 }, { scale: 1, duration: 0.3, ease: "back.out(3)" });
    });
  }

  if (shuffleBtn) {
    shuffleBtn.addEventListener("click", () => {
      shuffleOn = !shuffleOn;
      shuffleBtn.classList.toggle("active", shuffleOn);
      if (shuffleOn && repeatOn) {
        repeatOn = false;
        repeatBtn.classList.remove("active");
      }
      if (window.gsap) gsap.fromTo(shuffleBtn, { scale: 0.8 }, { scale: 1, duration: 0.3, ease: "back.out(3)" });
    });
  }

  if (seekBar) {
    seekBar.addEventListener("input", () => {
      if (!duration) return;
      seeking = true;
      seekBar.style.setProperty("--fill", seekBar.value + "%");
      const t = (seekBar.value / 100) * duration;
      if (curTimeEl) curTimeEl.textContent = formatTime(t);
    });

    seekBar.addEventListener("change", () => {
      if (!ytPlayer || !duration) { seeking = false; return; }
      const t = (seekBar.value / 100) * duration;
      ytPlayer.seekTo(t, true);
      seeking = false;
      writeNowPlaying();
    });
  }

  // ---- Ses Kontrolleri ----
  function applyVolume(vol) {
    if (!ytPlayer || !ytPlayer.setVolume) return;
    ytPlayer.setVolume(vol);
    if (volumeSlider) volumeSlider.style.setProperty("--vol-fill", vol + "%");
    if (muteBtn) muteBtn.textContent = vol === 0 ? "🔇" : vol < 50 ? "🔉" : "🔊";
  }

  if (volumeSlider) {
    volumeSlider.addEventListener("input", () => {
      const vol = Number(volumeSlider.value);
      isMuted = vol === 0;
      lastVolume = vol || lastVolume;
      applyVolume(vol);
      writeNowPlaying();
    });
  }

  if (muteBtn) {
    muteBtn.addEventListener("click", () => {
      isMuted = !isMuted;
      if (isMuted) {
        lastVolume = Number(volumeSlider.value) || lastVolume;
        if (volumeSlider) volumeSlider.value = 0;
        applyVolume(0);
      } else {
        const targetVol = lastVolume || 100;
        if (volumeSlider) volumeSlider.value = targetVol;
        applyVolume(targetVol);
      }
      writeNowPlaying();
    });
  }

  // ---- Video Modu Yönetimi ----
  function enterVideoMode() {
    videoModeOn = true;
    if (videoFrame && ytPlayerHost) {
      videoFrame.appendChild(ytPlayerHost);
      ytPlayerHost.classList.add("video-mode");
    }
    document.body.classList.add("video-active");
  }

  function exitVideoMode() {
    videoModeOn = false;
    if (ytPlayerHost) {
      document.body.appendChild(ytPlayerHost);
      ytPlayerHost.classList.remove("video-mode");
    }
    document.body.classList.remove("video-active");
  }

  if (videoToggleBtn) videoToggleBtn.addEventListener("click", enterVideoMode);
  if (videoHideBtn) videoHideBtn.addEventListener("click", exitVideoMode);

  // ---- Sayfadan Ayrılma (Listeye Dön) ----
  if (backLink) {
    backLink.addEventListener("click", (e) => {
      e.preventDefault();
      writeNowPlaying({ progress: ytPlayer ? ytPlayer.getCurrentTime() : startAt });

      if (window.gsap && stage) {
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
  }

  window.addEventListener("pagehide", () => {
    if (videoId) writeNowPlaying({ progress: ytPlayer ? ytPlayer.getCurrentTime() : startAt });
  });

  // ---- Şarkı Sözleri (Lrclib API) ----
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
    if (!lyricsContent) return;
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
    if (!lyricsContent) return;
    lyricsContent.innerHTML = `<div class="lyric-plain"></div>`;
    const plainEl = lyricsContent.querySelector(".lyric-plain");
    if (plainEl) plainEl.textContent = text;
  }

  function updateActiveLyric(currentTime) {
    if (!syncedLyrics || !syncedLyrics.length || !lyricsContent) return;

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
      el.classList.toggle("active", lineIdx === idx);
    });

    if (idx >= 0 && lyricsContainerOuter) {
      const activeEl = lyricsContent.querySelector(`[data-index="${idx}"]`);
      if (activeEl) {
        const offset = activeEl.offsetTop - (lyricsContainerOuter.clientHeight / 2) + (activeEl.clientHeight / 2);
        lyricsContainerOuter.scrollTo({ top: offset, behavior: "smooth" });
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
      if (lyricsStatus) lyricsStatus.textContent = "Söz bulunamadı.";
      return;
    }

    if (lyricsStatus) lyricsStatus.textContent = "Sözler yükleniyor...";

    try {
      let results = await searchLrclib(track, artist);
      if (!results || !results.length) {
        results = await searchLrclib(track, "");
      }

      if (!results || !results.length) {
        if (lyricsStatus) lyricsStatus.textContent = "Bu şarkı için söz bulunamadı.";
        return;
      }

      const withSynced = results.find(r => r.syncedLyrics);
      const best = withSynced || results[0];

      if (best.syncedLyrics) {
        syncedLyrics = parseLRC(best.syncedLyrics);
        if (lyricsStatus) lyricsStatus.textContent = "";
        renderSyncedLyrics(syncedLyrics);
      } else if (best.plainLyrics) {
        if (lyricsStatus) lyricsStatus.textContent = "";
        renderPlainLyrics(best.plainLyrics);
      } else {
        if (lyricsStatus) lyricsStatus.textContent = "Bu şarkı için söz bulunamadı.";
      }
    } catch (err) {
      if (lyricsStatus) lyricsStatus.textContent = "Sözler alınamadı.";
    }
  }

  fetchLyrics();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPlayerPage);
} else {
  initPlayerPage();
}
