function initPlayerPage() {
  const params = new URLSearchParams(window.location.search);
  const videoId = params.get("v");
  const rawTitle = params.get("t") || "Bilinmeyen Şarkı";
  const channel = params.get("c") || "";

  const NOWPLAYING_KEY = "cinla_now_playing";
  const QUEUE_KEY = "cinla_queue";
  const coverUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";

  // HTML Elementleri
  const trackTitleEl = document.getElementById("trackTitle");
  const trackChannelEl = document.getElementById("trackChannel");
  const playerStatusEl = document.getElementById("playerStatus");
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
  const backLink = document.getElementById("backLink");
  const muteBtn = document.getElementById("muteBtn");
  const volumeSlider = document.getElementById("volumeSlider");
  const queueToggleBtn = document.getElementById("queueToggleBtn");
  const queueCloseBtn = document.getElementById("queueCloseBtn");
  const queuePanel = document.getElementById("queuePanel");
  const queueListEl = document.getElementById("queueList");
  const hudToggleBtn = document.getElementById("hudToggleBtn");

  // Bilgileri ve arka planı anında set et
  if (trackTitleEl) trackTitleEl.textContent = rawTitle;
  if (trackChannelEl) trackChannelEl.textContent = channel;

  // Kapak / arka plan: resim gerçekten yüklenirse uygula, 404/başarısız
  // olursa ekranı boş bırakmak yerine yumuşak bir gradyana düş.
  function applyCoverImages() {
  if (!coverUrl) return;
  if (bgBlurEl) bgBlurEl.style.backgroundImage = `url("${coverUrl}")`;
  if (coverImgEl) {
    coverImgEl.src = coverUrl;
    coverImgEl.onerror = () => {
      if (bgBlurEl) bgBlurEl.style.backgroundImage = "";
    };
  }
}
applyCoverImages();
  
  let ytPlayer = null;
  let isPlaying = false;
  let duration = 0;
  let seeking = false;
  let syncedLyrics = null;
  let currentLineIndex = -1;
  let repeatOn = false;
  let shuffleOn = false;
  let isMuted = false;
  let lastVolume = 100;
  let startAt = 0;
  let progressIntervalId = null;

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function setStatus(msg) {
    if (playerStatusEl) playerStatusEl.textContent = msg || "";
  }

  // ---- İkonlar (emoji yok, kendi SVG'lerimiz) ----
  const ICON_PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  function setPlayIcon(playing) {
    if (!playBtn) return;
    playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
  }
  setPlayIcon(false);

  // ---- LocalStorage Yönetimi ----
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

  // ---- Çalma Sırası (Queue) ----
  function readQueue() {
    try {
      const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "null");
      return Array.isArray(q) && q.length ? q : null;
    } catch {
      return null;
    }
  }

  let queue = readQueue() || [];
  let queueIndex = queue.findIndex(s => s && s.id === videoId);
  if (queueIndex === -1) {
    // Kayıtlı bir sıra yoksa (örn. doğrudan bağlantıyla gelindiyse),
    // en azından çalan şarkıyı tek elemanlı bir sıra olarak göster.
    queue = [{ id: videoId, title: rawTitle, channel }, ...queue.filter(s => s.id !== videoId)];
    queueIndex = 0;
  }

  function escapeHtmlLocal(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function goToSong(song) {
    writeNowPlaying({ progress: 0, isPlaying: true });
    window.location.href = `player.html?v=${encodeURIComponent(song.id)}&t=${encodeURIComponent(song.title)}&c=${encodeURIComponent(song.channel || "")}`;
  }

  function renderQueuePanel() {
    if (!queueListEl) return;
    if (!queue.length) {
      queueListEl.innerHTML = `<p class="queue-empty">Sırada başka şarkı yok.</p>`;
      return;
    }
    queueListEl.innerHTML = "";
    queue.forEach((song, i) => {
      const item = document.createElement("div");
      item.className = "queue-item" + (i === queueIndex ? " current" : "");
      const thumb = `https://i.ytimg.com/vi/${song.id}/default.jpg`;
      item.innerHTML = `
        <span class="qi-index">${i + 1}</span>
        <img src="${thumb}" alt="" loading="lazy">
        <div class="qi-info">
          <p class="qi-title">${escapeHtmlLocal(song.title)}</p>
          <p class="qi-channel">${escapeHtmlLocal(song.channel || "")}</p>
        </div>
      `;
      if (i !== queueIndex) {
        item.addEventListener("click", () => goToSong(song));
      }
      queueListEl.appendChild(item);
    });
  }
  renderQueuePanel();

  if (queueToggleBtn && queuePanel) {
    queueToggleBtn.addEventListener("click", () => {
      queuePanel.classList.add("open");
    });
  }
  if (queueCloseBtn && queuePanel) {
    queueCloseBtn.addEventListener("click", () => {
      queuePanel.classList.remove("open");
    });
  }

  function playNextInQueue({ auto = true } = {}) {
    if (!queue.length) {
      clearNowPlaying();
      return;
    }
    if (queue.length === 1) {
      if (auto) clearNowPlaying();
      return;
    }
    let nextIdx;
    if (shuffleOn) {
      do {
        nextIdx = Math.floor(Math.random() * queue.length);
      } while (nextIdx === queueIndex);
    } else {
      nextIdx = (queueIndex + 1) % queue.length;
    }
    const next = queue[nextIdx];
    if (!next) {
      clearNowPlaying();
      return;
    }
    goToSong(next);
  }

  // ---- GSAP Animasyonu ----
  if (window.gsap) {
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.to(".back-link", { opacity: 1, duration: 0.4 }, 0)
      .fromTo(".now-row", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5 }, "-=0.2")
      .fromTo(".controls", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4 }, "-=0.25");
  }

  // ---- Equalizer ----
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
        e.target.playVideo();
        startProgressLoop();
      },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING) {
          isPlaying = true;
          setPlayIcon(true);
          startEqualizer();
          writeNowPlaying();
        } else if (e.data === YT.PlayerState.PAUSED) {
          isPlaying = false;
          setPlayIcon(false);
          stopEqualizer();
          writeNowPlaying();
        } else if (e.data === YT.PlayerState.ENDED) {
          isPlaying = false;
          setPlayIcon(false);
          stopEqualizer();
          handleTrackEnd();
        }
      },
      onError: () => {
        setStatus("Bu video oynatılamıyor, sıradaki şarkıya geçiliyor...");
        stopEqualizer();
        setTimeout(() => playNextInQueue({ auto: true }), 1600);
      },
    }).then((player) => {
      ytPlayer = player;
    });
  } else {
    if (lyricsStatus) lyricsStatus.textContent = "Oynatıcı yüklenemedi.";
    setStatus("Şarkı bilgisi bulunamadı.");
  }

  function handleTrackEnd() {
    if (repeatOn) {
      ytPlayer.seekTo(0, true);
      ytPlayer.playVideo();
      return;
    }
    clearNowPlaying();
    playNextInQueue({ auto: true });
  }

  function startProgressLoop() {
    if (progressIntervalId) clearInterval(progressIntervalId);
    progressIntervalId = setInterval(() => {
      if (!ytPlayer || typeof ytPlayer.getDuration !== "function") return;

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

  // ---- Kontroller ----
  if (playBtn) {
    playBtn.addEventListener("click", () => {
      if (!ytPlayer) return;
      if (isPlaying) ytPlayer.pauseVideo();
      else ytPlayer.playVideo();
    });
  }

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      if (!ytPlayer) return;
      ytPlayer.seekTo(Math.max(0, ytPlayer.getCurrentTime() - 10), true);
    });
  }

  if (fwdBtn) {
    fwdBtn.addEventListener("click", () => {
      if (!ytPlayer) return;
      ytPlayer.seekTo(Math.min(duration, ytPlayer.getCurrentTime() + 10), true);
    });
  }

  if (repeatBtn) {
    repeatBtn.addEventListener("click", () => {
      repeatOn = !repeatOn;
      repeatBtn.classList.toggle("active", repeatOn);
    });
  }

  if (shuffleBtn) {
    shuffleBtn.addEventListener("click", () => {
      shuffleOn = !shuffleOn;
      shuffleBtn.classList.toggle("active", shuffleOn);
    });
  }

  if (seekBar) {
    seekBar.addEventListener("input", () => {
      if (!duration) return;
      seeking = true;
      seekBar.style.setProperty("--fill", seekBar.value + "%");
      if (curTimeEl) curTimeEl.textContent = formatTime((seekBar.value / 100) * duration);
    });

    seekBar.addEventListener("change", () => {
      if (!ytPlayer || !duration) { seeking = false; return; }
      ytPlayer.seekTo((seekBar.value / 100) * duration, true);
      seeking = false;
      writeNowPlaying();
    });
  }

  // ---- Ses ve Video Modu ----
  function updateVolumeIcon(vol) {
    if (!muteBtn) return;
    if (vol === 0) {
      muteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C22.63 14.85 23 13.48 23 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;
    } else {
      muteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
    }
  }

  function applyVolume(vol) {
    if (!ytPlayer || !ytPlayer.setVolume) return;
    ytPlayer.setVolume(vol);
    if (volumeSlider) volumeSlider.style.setProperty("--vol-fill", vol + "%");
    updateVolumeIcon(vol);
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

  // ---- HUD (kontrolleri) gizle/göster — tam ekran video modunda ----
  let hudHideTimer = null;

  function setHudHidden(hidden) {
    document.body.classList.toggle("hud-hidden", hidden);
    if (hudToggleBtn) {
      const label = hudToggleBtn.querySelector("span");
      if (label) label.textContent = hidden ? "Kontrolleri Göster" : "Kontrolleri Gizle";
    }
  }

  function scheduleHudAutoHide() {
    if (hudHideTimer) clearTimeout(hudHideTimer);
    if (!document.body.classList.contains("video-active")) return;
    hudHideTimer = setTimeout(() => setHudHidden(true), 3500);
  }

  function wakeHud() {
    if (!document.body.classList.contains("video-active")) return;
    setHudHidden(false);
    scheduleHudAutoHide();
  }

  // Fare/parmak hareketinde kontrolleri geri getir, sonra tekrar gizle.
  document.addEventListener("mousemove", wakeHud);
  document.addEventListener("touchstart", wakeHud, { passive: true });

  if (hudToggleBtn) {
    hudToggleBtn.addEventListener("click", () => {
      const nowHidden = !document.body.classList.contains("hud-hidden");
      setHudHidden(nowHidden);
      if (!nowHidden) scheduleHudAutoHide();
      else if (hudHideTimer) clearTimeout(hudHideTimer);
    });
  }

  if (videoToggleBtn && videoFrame && ytPlayerHost) {
    videoToggleBtn.addEventListener("click", () => {
      videoFrame.appendChild(ytPlayerHost);
      document.body.classList.add("video-active");
      setHudHidden(false);
      scheduleHudAutoHide();
      // YouTube kaliteyi oynatıcı boyutuna göre otomatik seçiyor; tam
      // ekrana geçince mümkün olan en yüksek çözünürlüğü (genelde 1080p
      // ve üzeri) seçmesi için tekrar deniyoruz.
      if (ytPlayer && typeof ytPlayer.setPlaybackQuality === "function") {
        ytPlayer.setPlaybackQuality("hd1080");
      }
    });
  }

  if (videoHideBtn && ytPlayerHost) {
    videoHideBtn.addEventListener("click", () => {
      document.body.appendChild(ytPlayerHost);
      document.body.classList.remove("video-active");
      setHudHidden(false);
      if (hudHideTimer) clearTimeout(hudHideTimer);
    });
  }

  if (backLink) {
    backLink.addEventListener("click", (e) => {
      e.preventDefault();
      writeNowPlaying({ progress: ytPlayer ? ytPlayer.getCurrentTime() : startAt });
      window.location.href = "index.html";
    });
  }

  // ---- Sözler (Lrclib API) ----
  function cleanTitleForSearch(title) {
    return title
      .replace(/\(.*?\)/g, "")
      .replace(/\[.*?\]/g, "")
      .replace(/official\s*(video|audio|music\s*video|lyric\s*video)?/gi, "")
      .replace(/lyrics?\s*video/gi, "")
      .replace(/\b(4k|hd|hq)\b/gi, "")
      .replace(/[|]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
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
        result.push({ time: min * 60 + sec + ms / 1000, text });
      });
    });
    return result.sort((a, b) => a.time - b.time);
  }

  function updateActiveLyric(currentTime) {
    if (!syncedLyrics || !syncedLyrics.length || !lyricsContent) return;
    let idx = -1;
    for (let i = 0; i < syncedLyrics.length; i++) {
      if (syncedLyrics[i].time <= currentTime + 0.15) idx = i;
      else break;
    }
    if (idx === currentLineIndex) return;
    currentLineIndex = idx;

    lyricsContent.querySelectorAll(".lyric-line").forEach((el) => {
      el.classList.toggle("active", parseInt(el.dataset.index, 10) === idx);
    });

    if (idx >= 0 && lyricsContainerOuter) {
      const activeEl = lyricsContent.querySelector(`[data-index="${idx}"]`);
      if (activeEl) {
        lyricsContainerOuter.scrollTo({
          top: activeEl.offsetTop - (lyricsContainerOuter.clientHeight / 2) + (activeEl.clientHeight / 2),
          behavior: "smooth"
        });
      }
    }
  }

  // "Sanatçı - Şarkı Adı" formatındaki başlığı ayırır. Sadece track_name
  // ile arama yapmak eşleşmeyi büyük ölçüde bozuyordu; artist_name'i de
  // ayrı gönderdiğimizde lrclib çok daha isabetli sonuç veriyor.
  function splitArtistTrack(title, fallbackArtist) {
    const cleaned = cleanTitleForSearch(title);
    const parts = cleaned.split(/\s+[-–—]\s+/);
    if (parts.length >= 2) {
      return { artist: parts[0].trim(), track: parts.slice(1).join(" - ").trim() };
    }
    return { artist: (fallbackArtist || "").trim(), track: cleaned.trim() };
  }

  async function lrclibSearch(params) {
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await fetch(`https://lrclib.net/api/search?${qs}`);
      if (!res.ok) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : [];
    } catch {
      // Ağ/CORS hatası - sessizce boş dön, üst fonksiyon diğer denemelere geçsin.
      return [];
    }
  }

  async function fetchLyrics() {
    const { artist, track } = splitArtistTrack(rawTitle, channel);
    const fallbackArtist = (channel || "").trim();

    if (lyricsStatus) lyricsStatus.textContent = "Sözler yükleniyor...";

    try {
      let results = [];

      // 1. Deneme: ayrılan sanatçı + şarkı adı (en isabetli eşleşme)
      if (track && artist) {
        results = await lrclibSearch({ track_name: track, artist_name: artist });
      }

      // 2. Deneme: ayrılamadıysa ya da sonuç boşsa, kanal adını sanatçı olarak dene
      if (!results.length && track && fallbackArtist && fallbackArtist !== artist) {
        results = await lrclibSearch({ track_name: track, artist_name: fallbackArtist });
      }

      // 3. Deneme: sadece şarkı adı (sanatçısız)
      if (!results.length && track) {
        results = await lrclibSearch({ track_name: track });
      }

      // 4. Deneme: genel serbest metin araması (q) - temizlenmiş başlıkla
      if (!results.length) {
        results = await lrclibSearch({ q: track || cleanTitleForSearch(rawTitle) });
      }

      // 5. Deneme: q araması - ham (temizlenmemiş) başlıkla, en son çare
      if (!results.length) {
        results = await lrclibSearch({ q: rawTitle });
      }

      if (!results.length) {
        if (lyricsStatus) lyricsStatus.textContent = "Bu şarkı için söz bulunamadı.";
        return;
      }

      const best = results.find(r => r.syncedLyrics) || results.find(r => r.plainLyrics) || results[0];

      if (best.syncedLyrics) {
        syncedLyrics = parseLRC(best.syncedLyrics);
        if (!syncedLyrics.length) {
          if (best.plainLyrics) {
            if (lyricsStatus) lyricsStatus.textContent = "";
            lyricsContent.innerHTML = `<div class="lyric-plain">${escapeHtmlLocal(best.plainLyrics)}</div>`;
          } else if (lyricsStatus) {
            lyricsStatus.textContent = "Söz bulunamadı.";
          }
          return;
        }
        if (lyricsStatus) lyricsStatus.textContent = "";
        lyricsContent.innerHTML = "";
        syncedLyrics.forEach((line, i) => {
          const div = document.createElement("div");
          div.className = "lyric-line";
          div.dataset.index = i;
          div.textContent = line.text || "♪";
          div.addEventListener("click", () => { if (ytPlayer) ytPlayer.seekTo(line.time, true); });
          lyricsContent.appendChild(div);
        });
      } else if (best.plainLyrics) {
        if (lyricsStatus) lyricsStatus.textContent = "";
        lyricsContent.innerHTML = `<div class="lyric-plain">${escapeHtmlLocal(best.plainLyrics)}</div>`;
      } else {
        if (lyricsStatus) lyricsStatus.textContent = "Söz bulunamadı.";
      }
    } catch {
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
