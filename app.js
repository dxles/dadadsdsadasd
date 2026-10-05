// ---- GSAP eklentileri ----
if (window.gsap) {
  const plugins = [window.Flip, window.ScrollToPlugin, window.SplitText].filter(Boolean);
  gsap.registerPlugin(...plugins);
}

const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
function motionOK() {
  return !!window.gsap && !reduceMotionQuery.matches;
}

// ---- Durum ----
let currentGenre = "hepsi";       // "hepsi" | "rap" | "arabesk" | "pop" | "benim" | playlist id ("pl_...")
let allSongs = [];
let lastRenderedSongs = [];
let openMenuId = null; // hangi kartın "listeye ekle" menüsü açık

// ---- Mini oynatıcı: player.html'den "Listeye dön" ile ayrılınca müzik
// burada, sağ altta gizli bir YouTube player ile devam eder. ----
let miniYtPlayer = null;
let miniIsPlaying = false;
let miniEqTweens = [];
let miniSaveInterval = null;

const ICON_PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';

function writeMiniProgress() {
  const np = readNowPlaying();
  if (!np || !miniYtPlayer || !miniYtPlayer.getCurrentTime) return;
  np.progress = miniYtPlayer.getCurrentTime();
  np.isPlaying = miniIsPlaying;
  np.updatedAt = Date.now();
  writeNowPlaying(np);
}

function startMiniEqualizer() {
  const miniEq = document.getElementById("miniEq");
  if (!miniEq) return;
  const bars = miniEq.querySelectorAll("span");
  stopMiniEqualizerTweens();
  if (window.gsap) {
    bars.forEach((bar, i) => {
      const tw = gsap.to(bar, {
        height: () => 3 + Math.random() * 10,
        duration: 0.28 + Math.random() * 0.22,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        delay: i * 0.06,
      });
      miniEqTweens.push(tw);
    });
  }
}

function stopMiniEqualizerTweens() {
  miniEqTweens.forEach(t => t.kill());
  miniEqTweens = [];
  const miniEq = document.getElementById("miniEq");
  if (miniEq && window.gsap) {
    miniEq.querySelectorAll("span").forEach(bar => gsap.to(bar, { height: 3, duration: 0.2 }));
  }
}

function initMiniPlayer() {
  const np = readNowPlaying();
  if (!np || !np.id) return;

  const miniPlayer = document.getElementById("miniPlayer");
  const miniCover = document.getElementById("miniCover");
  const miniTitle = document.getElementById("miniTitle");
  const miniChannel = document.getElementById("miniChannel");
  const miniInfoLink = document.getElementById("miniInfoLink");
  const miniPlayBtn = document.getElementById("miniPlayBtn");
  const miniCloseBtn = document.getElementById("miniCloseBtn");

  miniPlayBtn.innerHTML = ICON_PAUSE;
  miniCover.src = `https://i.ytimg.com/vi/${np.id}/mqdefault.jpg`;
  miniTitle.textContent = np.title || "Bilinmeyen şarkı";
  miniChannel.textContent = np.channel || "";
  miniInfoLink.href = `player.html?v=${encodeURIComponent(np.id)}&t=${encodeURIComponent(np.title || "")}&c=${encodeURIComponent(np.channel || "")}`;

  miniPlayer.classList.remove("hidden");
  requestAnimationFrame(() => miniPlayer.classList.add("visible"));

  createYtPlayer("ytMiniHost", np.id, {
    onReady: (e) => {
      if (typeof np.volume === "number") e.target.setVolume(np.volume);
      if (np.progress) e.target.seekTo(np.progress, true);
      if (np.isPlaying !== false) {
        e.target.playVideo();
      } else {
        miniPlayBtn.innerHTML = ICON_PLAY;
      }
      miniSaveInterval = setInterval(writeMiniProgress, 1000);
    },
    onStateChange: (e) => {
      if (e.data === YT.PlayerState.PLAYING) {
        miniIsPlaying = true;
        miniPlayBtn.innerHTML = ICON_PAUSE;
        startMiniEqualizer();
      } else if (e.data === YT.PlayerState.PAUSED) {
        miniIsPlaying = false;
        miniPlayBtn.innerHTML = ICON_PLAY;
        stopMiniEqualizerTweens();
      } else if (e.data === YT.PlayerState.ENDED) {
        miniIsPlaying = false;
        stopMiniEqualizerTweens();
        clearNowPlaying();
        closeMiniPlayer();
      }
      writeMiniProgress();
    },
  }).then((player) => {
    miniYtPlayer = player;
  });

  miniPlayBtn.addEventListener("click", () => {
    if (!miniYtPlayer) return;
    if (miniIsPlaying) {
      miniYtPlayer.pauseVideo();
    } else {
      miniYtPlayer.playVideo();
    }
  });

  function closeMiniPlayer() {
    if (miniSaveInterval) clearInterval(miniSaveInterval);
    if (miniYtPlayer && miniYtPlayer.stopVideo) miniYtPlayer.stopVideo();
    clearNowPlaying();
    miniPlayer.classList.remove("visible");
    setTimeout(() => miniPlayer.classList.add("hidden"), 300);
  }

  miniCloseBtn.addEventListener("click", closeMiniPlayer);
  window.addEventListener("pagehide", writeMiniProgress);
}

// ---- DOM ----
const songGrid = document.getElementById("songGrid");
const statusBar = document.getElementById("statusBar");
const sectionTitle = document.getElementById("sectionTitle");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const genreButtons = document.querySelectorAll(".genre-btn");
const apiKeyInput = document.getElementById("apiKeyInput");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const refreshBtn = document.getElementById("refreshBtn");
const addSongBtn = document.getElementById("addSongBtn");
const addModal = document.getElementById("addModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const addSearchInput = document.getElementById("addSearchInput");
const addSearchBtn = document.getElementById("addSearchBtn");
const addResults = document.getElementById("addResults");
const apiHelpBtn = document.getElementById("apiHelpBtn");
const apiHelpModal = document.getElementById("apiHelpModal");
const closeApiHelpBtn = document.getElementById("closeApiHelpBtn");
const newPlaylistBtn = document.getElementById("newPlaylistBtn");
const playlistList = document.getElementById("playlistList");
const contentEl = document.getElementById("content");
const brandName = document.getElementById("brandName");
const spotifyImportInput = document.getElementById("spotifyImportInput");
const spotifyImportBtn = document.getElementById("spotifyImportBtn");
const spotifyImportStatus = document.getElementById("spotifyImportStatus");
const importProgressFill = document.getElementById("importProgressFill");
const importProgress = document.getElementById("importProgress");
const spotifyPasteBox = document.getElementById("spotifyPasteBox");
const spotifyPasteInput = document.getElementById("spotifyPasteInput");
const spotifyPasteBtn = document.getElementById("spotifyPasteBtn");


// ---- Hareket ----
// Sayfa açılışında tek bir sahne: halkalar yayılır, "Çınla" yazısı yerine oturur,
// ardından sol menü ve başlık belirir.
let brandSplit = null;
let titleSplit = null;

function playIntro() {
  if (!motionOK()) return;
  const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  ready.then(() => {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    document.querySelectorAll(".brand-mark .ring").forEach((ring, i) => {
      tl.from(ring, { attr: { r: 3 }, opacity: 0, duration: 0.9, ease: "power2.out" }, i * 0.12);
    });
    tl.from(".brand-mark .dot", { scale: 0, transformOrigin: "50% 50%", duration: 0.4, ease: "back.out(2.5)" }, 0);

    if (window.SplitText) {
      brandSplit = SplitText.create(brandName, { type: "chars" });
      tl.from(brandSplit.chars, { yPercent: 70, opacity: 0, duration: 0.55, stagger: 0.05 }, 0.25);
      tl.add(() => { if (brandSplit) { brandSplit.revert(); brandSplit = null; } });
    } else {
      tl.from(brandName, { opacity: 0, duration: 0.5 }, 0.25);
    }

    tl.from(".sidebar > *:not(.brand)", { opacity: 0, duration: 0.45, stagger: 0.05, ease: "power1.out" }, 0.45);
    tl.add(() => animateTitle(), 0.5);
  });
}

// Başlık değişince harfler yukarıdan yerine oturur (kullanıcının tıkladığı bir şeye verilen yanıt).
function animateTitle() {
  if (!motionOK() || !window.SplitText) return;
  if (titleSplit) { titleSplit.revert(); titleSplit = null; }
  titleSplit = SplitText.create(sectionTitle, { type: "chars" });
  gsap.from(titleSplit.chars, {
    yPercent: 45,
    opacity: 0,
    duration: 0.45,
    ease: "power3.out",
    stagger: { each: Math.min(0.025, 0.6 / Math.max(titleSplit.chars.length, 1)) },
    onComplete: () => { if (titleSplit) { titleSplit.revert(); titleSplit = null; } },
  });
}

function setSectionTitle(text) {
  if (titleSplit) { titleSplit.revert(); titleSplit = null; }
  sectionTitle.textContent = text;
  animateTitle();
}

// Liste değişince içeriği yumuşakça en başa kaydır.
function scrollContentToTop() {
  const innerScroll = contentEl.scrollHeight > contentEl.clientHeight && getComputedStyle(contentEl).overflowY !== "visible";
  const target = innerScroll ? contentEl : window;
  if (!motionOK() || !window.ScrollToPlugin) {
    if (innerScroll) contentEl.scrollTop = 0; else window.scrollTo(0, 0);
    return;
  }
  gsap.to(target, { scrollTo: { y: 0, autoKill: true }, duration: 0.5, ease: "power2.out" });
}

// ---- Başlangıç ----
function init() {
  apiKeyInput.value = getApiKey();
  // Eski sürümde kaydedilmiş Spotify Client ID / Secret artık gerekmiyor, temizle.
  try {
    localStorage.removeItem("cinla_spotify_client_id");
    localStorage.removeItem("cinla_spotify_client_secret");
  } catch (_) { /* yok say */ }

  const cached = getCachedSongs();
  allSongs = cached && cached.length ? cached : SEED_SONGS.slice();

  renderPlaylistNav();
  renderGrid();
  initMiniPlayer();

  document.addEventListener("click", (e) => {
    if (openMenuId && !e.target.closest(".card-add-menu") && !e.target.closest(".card-add-btn")) {
      closeAllCardMenus();
    }
  });

  // Bir şarkı kartına tıklandığında, o an ekranda görünen listeyi
  // "çalma sırası" olarak kaydet; player.html şarkı bitince buradan
  // sıradakine otomatik geçer.
  songGrid.addEventListener("click", (e) => {
    const link = e.target.closest("a.song-card-link");
    if (!link || !songGrid.contains(link)) return;
    saveQueue(lastRenderedSongs);
  });

  genreButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      setActiveNav(btn);
      currentGenre = btn.dataset.genre;
      setSectionTitle(btn.textContent);
      renderGrid();
      scrollContentToTop();
    });
  });

  newPlaylistBtn.addEventListener("click", () => {
    const name = prompt("Yeni çalma listesi adı:");
    if (!name || !name.trim()) return;
    const pl = createPlaylist(name);
    renderPlaylistNav();
    if (pl) selectPlaylist(pl.id, pl.name);
  });

  searchBtn.addEventListener("click", doSiteSearch);
  searchInput.addEventListener("keydown", e => { if (e.key === "Enter") doSiteSearch(); });

  saveKeyBtn.addEventListener("click", () => {
    setApiKey(apiKeyInput.value.trim());
    setStatus("YouTube API anahtarı kaydedildi.");
  });

  refreshBtn.addEventListener("click", refreshFromYouTube);

  spotifyImportBtn.addEventListener("click", doSpotifyImport);
  spotifyImportInput.addEventListener("keydown", e => { if (e.key === "Enter") doSpotifyImport(); });
  spotifyPasteBtn.addEventListener("click", doPasteImport);

  playIntro();

  addSongBtn.addEventListener("click", () => {
    addModal.classList.remove("hidden");
    if (motionOK()) {
      gsap.fromTo(addModal, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      gsap.fromTo(".modal-box", { opacity: 0, y: 12, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "power2.out" });
    }
    addSearchInput.focus();
  });

  function closeAddModal() {
    if (motionOK()) {
      gsap.to(".modal-box", { opacity: 0, y: 8, scale: 0.97, duration: 0.2, ease: "power1.in" });
      gsap.to(addModal, { opacity: 0, duration: 0.2, onComplete: () => addModal.classList.add("hidden") });
    } else {
      addModal.classList.add("hidden");
    }
  }

  closeModalBtn.addEventListener("click", closeAddModal);
  addModal.addEventListener("click", e => { if (e.target === addModal) closeAddModal(); });
  addSearchBtn.addEventListener("click", doAddSearch);
  addSearchInput.addEventListener("keydown", e => { if (e.key === "Enter") doAddSearch(); });

  // ---- API anahtarı nasıl alınır yardım modalı ----
  function openApiHelp() {
    apiHelpModal.classList.remove("hidden");
    if (motionOK()) {
      gsap.fromTo(apiHelpModal, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      gsap.fromTo(apiHelpModal.querySelector(".modal-box"), { opacity: 0, y: 12, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "power2.out" });
    }
  }

  function closeApiHelp() {
    if (motionOK()) {
      gsap.to(apiHelpModal.querySelector(".modal-box"), { opacity: 0, y: 8, scale: 0.97, duration: 0.2, ease: "power1.in" });
      gsap.to(apiHelpModal, { opacity: 0, duration: 0.2, onComplete: () => apiHelpModal.classList.add("hidden") });
    } else {
      apiHelpModal.classList.add("hidden");
    }
  }

  apiHelpBtn.addEventListener("click", openApiHelp);
  closeApiHelpBtn.addEventListener("click", closeApiHelp);
  apiHelpModal.addEventListener("click", e => { if (e.target === apiHelpModal) closeApiHelp(); });

  // İlk ziyarette anahtar yoksa yardım modalını otomatik göster
  if (!getApiKey()) {
    openApiHelp();
  }
}

function setActiveNav(activeBtn) {
  genreButtons.forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".playlist-btn").forEach(b => b.classList.remove("active"));
  if (activeBtn) activeBtn.classList.add("active");
}

function selectPlaylist(id, name) {
  currentGenre = id;
  setSectionTitle(name);
  setActiveNav(null);
  const btn = playlistList.querySelector(`[data-playlist-id="${id}"] .playlist-btn`);
  if (btn) btn.classList.add("active");
  renderGrid();
  scrollContentToTop();
}

// ---- Sidebar: çalma listeleri ----
function renderPlaylistNav() {
  const playlists = getPlaylists();
  if (!playlists.length) {
    playlistList.innerHTML = `<div class="playlist-empty-hint">Henüz çalma listen yok.</div>`;
    return;
  }
  playlistList.innerHTML = "";
  playlists.forEach(pl => {
    const row = document.createElement("div");
    row.className = "playlist-item";
    row.dataset.playlistId = pl.id;
    row.innerHTML = `
      <button class="playlist-btn" data-playlist-id="${pl.id}">${escapeHtml(pl.name)}</button>
      <button class="playlist-del-btn" title="Sil">✕</button>
    `;
    row.querySelector(".playlist-btn").addEventListener("click", () => selectPlaylist(pl.id, pl.name));
    row.querySelector(".playlist-del-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm(`"${pl.name}" çalma listesini sil?`)) return;
      deletePlaylist(pl.id);
      renderPlaylistNav();
      if (currentGenre === pl.id) {
        const hepsiBtn = document.querySelector('.genre-btn[data-genre="hepsi"]');
        setActiveNav(hepsiBtn);
        currentGenre = "hepsi";
        setSectionTitle("Hepsi");
        renderGrid();
      }
    });
    playlistList.appendChild(row);
  });
}

function closeAllCardMenus() {
  document.querySelectorAll(".card-add-menu").forEach(m => m.remove());
  document.querySelectorAll(".card-add-btn.menu-open").forEach(b => b.classList.remove("menu-open"));
  openMenuId = null;
}

function openCardMenu(btn, song) {
  closeAllCardMenus();
  btn.classList.add("menu-open");
  openMenuId = song.id;

  const playlists = getPlaylists();
  const menu = document.createElement("div");
  menu.className = "card-add-menu";

  if (!playlists.length) {
    menu.innerHTML = `<span class="menu-empty">Henüz liste yok</span>`;
  } else {
    playlists.forEach(pl => {
      const item = document.createElement("button");
      item.textContent = pl.name;
      item.addEventListener("click", () => {
        const added = addSongToPlaylist(pl.id, song);
        setStatus(added ? `"${song.title}" → "${pl.name}" listesine eklendi.` : `Bu şarkı zaten "${pl.name}" listesinde.`);
        closeAllCardMenus();
      });
      menu.appendChild(item);
    });
  }

  const newOpt = document.createElement("button");
  newOpt.className = "new-playlist-opt";
  newOpt.textContent = "+ Yeni liste oluştur";
  newOpt.addEventListener("click", () => {
    const name = prompt("Yeni çalma listesi adı:");
    if (!name || !name.trim()) return;
    const pl = createPlaylist(name);
    addSongToPlaylist(pl.id, song);
    renderPlaylistNav();
    setStatus(`"${song.title}" → "${pl.name}" listesine eklendi.`);
    closeAllCardMenus();
  });
  menu.appendChild(newOpt);

  btn.parentElement.appendChild(menu);
}

function setStatus(msg) {
  statusBar.textContent = msg;
}

// ---- Grid render ----
const PLAY_GLYPH = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';

function renderGrid(list) {
  const userSongs = getUserSongs();
  const playlists = getPlaylists();
  let songs;

  if (list) {
    songs = list;
  } else if (currentGenre === "benim") {
    songs = userSongs;
  } else if (currentGenre === "hepsi") {
    songs = [...userSongs, ...allSongs];
  } else if (currentGenre.startsWith("pl_")) {
    const pl = playlists.find(p => p.id === currentGenre);
    songs = pl ? pl.songs : [];
  } else {
    songs = [...userSongs, ...allSongs].filter(s => s.genre === currentGenre);
  }

  lastRenderedSongs = songs;
  closeAllCardMenus();

  // Aynı şarkı iki listede de varsa Flip onu yerinden yerine taşır, yeni gelenler belirir.
  const flipState = motionOK() && window.Flip && songGrid.children.length
    ? Flip.getState(songGrid.querySelectorAll(".song-card"))
    : null;

  songGrid.innerHTML = "";

  if (!songs.length) {
    songGrid.innerHTML = `<div class="empty-state">Burada henüz şarkı yok. Soldan bir Spotify listesi aktarabilir ya da "Şarkı ekle" ile arayıp ekleyebilirsin.</div>`;
    return;
  }

  const seenIds = new Set();
  songs.forEach(song => {
    const card = document.createElement("div");
    card.className = "song-card";
    // Tekrarlı şarkılarda aynı flip kimliği çakışmasın.
    card.dataset.flipId = seenIds.has(song.id) ? `${song.id}-${seenIds.size}` : song.id;
    seenIds.add(song.id);
    const thumb = `https://i.ytimg.com/vi/${song.id}/mqdefault.jpg`;
    card.innerHTML = `
      <a class="song-card-link" href="player.html?v=${encodeURIComponent(song.id)}&t=${encodeURIComponent(song.title)}&c=${encodeURIComponent(song.channel || "")}">
        <div class="track-thumb">
          <img src="${thumb}" alt="" loading="lazy">
          <div class="track-play" aria-hidden="true"><span>${PLAY_GLYPH}</span></div>
        </div>
        <p class="song-card-title">${escapeHtml(song.title)}</p>
        <p class="song-card-channel">${escapeHtml(song.channel || "")}</p>
      </a>
      <button class="card-add-btn" title="Çalma listesine ekle" aria-label="Çalma listesine ekle">+</button>
    `;
    card.querySelector(".card-add-btn").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = openMenuId === song.id;
      if (isOpen) {
        closeAllCardMenus();
      } else {
        openCardMenu(e.currentTarget, song);
      }
    });
    songGrid.appendChild(card);
  });

  if (flipState) {
    Flip.from(flipState, {
      duration: 0.45,
      ease: "power2.out",
      onEnter: (els) => gsap.fromTo(els, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power1.out" }),
    });
  }
}

// ---- Site içi arama (mevcut listede) ----
function doSiteSearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { renderGrid(); return; }
  const userSongs = getUserSongs();
  const combined = [...userSongs, ...allSongs];
  const filtered = combined.filter(s =>
    s.title.toLowerCase().includes(q) || (s.channel || "").toLowerCase().includes(q)
  );
  setSectionTitle(`"${searchInput.value.trim()}" için sonuçlar`);
  renderGrid(filtered);
}

// ---- YouTube API üzerinden yenileme ----
async function refreshFromYouTube() {
  const key = getApiKey();
  if (!key) {
    setStatus("Önce sol alttan kendi YouTube API anahtarını gir ve kaydet.");
    return;
  }

  setStatus("YouTube'dan Türkçe şarkılar çekiliyor...");
  refreshBtn.disabled = true;

  const queries = [
    { q: "türkçe rap 2026 official", genre: "rap" },
    { q: "türkçe arabesk şarkılar", genre: "arabesk" },
    { q: "türkçe pop şarkılar 2026", genre: "pop" },
    { q: "hiphop türkçe official video", genre: "rap" },
  ];

  const results = [];

  try {
    for (const item of queries) {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=12&regionCode=TR&relevanceLanguage=tr&q=${encodeURIComponent(item.q)}&key=${key}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error?.message || `YouTube API hatası (${res.status})`);
      }
      const data = await res.json();
      (data.items || []).forEach(v => {
        results.push({
          id: v.id.videoId,
          title: decodeHtmlEntities(v.snippet.title),
          channel: decodeHtmlEntities(v.snippet.channelTitle),
          genre: item.genre,
        });
      });
    }

    // Aynı video birden çok sorguda gelmiş olabilir, tekilleştir
    const seen = new Set();
    const deduped = results.filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    allSongs = deduped;
    setCachedSongs(deduped);
    setStatus(`${deduped.length} şarkı YouTube'dan çekildi ve önbelleğe kaydedildi.`);
    renderGrid();
  } catch (err) {
    setStatus(`Hata: ${err.message}`);
  } finally {
    refreshBtn.disabled = false;
  }
}

// ---- Şarkı ekleme modalı: YouTube araması ----
async function doAddSearch() {
  const key = getApiKey();
  const q = addSearchInput.value.trim();
  if (!q) return;

  if (!key) {
    addResults.innerHTML = `<p class="note">Arama yapmak için önce sol alttan YouTube API anahtarını kaydet.</p>`;
    return;
  }

  addResults.innerHTML = `<p class="note">Aranıyor...</p>`;

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=10&q=${encodeURIComponent(q)}&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error?.message || `YouTube API hatası (${res.status})`);
    }
    const data = await res.json();
    const items = data.items || [];

    if (!items.length) {
      addResults.innerHTML = `<p class="note">Sonuç bulunamadı.</p>`;
      return;
    }

    addResults.innerHTML = "";
    items.forEach(v => {
      const id = v.id.videoId;
      const title = decodeHtmlEntities(v.snippet.title);
      const channel = decodeHtmlEntities(v.snippet.channelTitle);
      const thumb = v.snippet.thumbnails?.default?.url || `https://i.ytimg.com/vi/${id}/default.jpg`;

      const row = document.createElement("div");
      row.className = "add-result-item";
      row.innerHTML = `
        <img src="${thumb}" alt="">
        <div class="info">
          <p>${escapeHtml(title)}</p>
          <p class="sub">${escapeHtml(channel)}</p>
        </div>
        <button class="btn btn-primary btn-small">Ekle</button>
      `;
      row.querySelector("button").addEventListener("click", () => {
        saveUserSong({ id, title, channel, genre: "benim" });
        row.querySelector("button").textContent = "Eklendi";
        row.querySelector("button").disabled = true;
        if (currentGenre === "benim" || currentGenre === "hepsi") renderGrid();
      });
      addResults.appendChild(row);
    });
  } catch (err) {
    addResults.innerHTML = `<p class="note">Hata: ${escapeHtml(err.message)}</p>`;
  }
}

// ---- Spotify çalma listesi içe aktarma (Client ID / Secret gerekmez) ----
// Spotify'ın herkese açık "embed" sayfası, listenin şarkı adlarını ve sanatçılarını
// zaten içinde taşır. Tarayıcılar o sayfayı doğrudan okumamıza izin vermediği için
// (CORS) sayfa herkese açık bir CORS proxy üzerinden alınır. Bu yöntemin sınırları:
//  - Sadece herkese açık listeler çalışır.
//  - Embed sayfası en fazla ilk 100 şarkıyı verir.
//  - Proxy servisleri çökerse "listeyi kendin yapıştır" yolu devreye girer.

const CORS_PROXIES = [
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];

function extractSpotifyPlaylistId(url) {
  const m = (url || "").match(/playlist[/:]([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

async function fetchWithTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSpotifyEmbedHtml(playlistId) {
  const target = `https://open.spotify.com/embed/playlist/${playlistId}`;
  const attempts = [(u) => u, ...CORS_PROXIES];
  for (const make of attempts) {
    try {
      const res = await fetchWithTimeout(make(target));
      if (!res.ok) continue;
      const html = await res.text();
      if (html.includes("__NEXT_DATA__")) return html;
    } catch (_) {
      // sıradaki yolu dene
    }
  }
  throw new Error("Spotify sayfası açılamadı");
}

function findTrackList(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return null;
  if (Array.isArray(node)) {
    if (node.length && node[0] && typeof node[0] === "object" && typeof node[0].title === "string" &&
        (String(node[0].uri || "").startsWith("spotify:track") || "subtitle" in node[0])) {
      return node;
    }
    for (const item of node) {
      const found = findTrackList(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const key of Object.keys(node)) {
    const found = findTrackList(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function parseSpotifyEmbed(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  let data;
  try { data = JSON.parse(m[1]); } catch { return null; }

  const entity = data?.props?.pageProps?.state?.data?.entity;
  const list = Array.isArray(entity?.trackList) ? entity.trackList : findTrackList(data);
  if (!list) return null;

  const tracks = list
    .filter(t => t && t.title)
    .map(t => ({
      name: String(t.title).replace(/\u00a0/g, " ").trim(),
      artist: String(t.subtitle || "").replace(/\u00a0/g, " ").trim(),
    }));

  return { name: (entity?.name || entity?.title || "").trim(), tracks };
}

async function findYoutubeIdForTrack(query, ytKey) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=1&q=${encodeURIComponent(query)}&key=${ytKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const err = new Error(errBody.error?.message || `YouTube API hatası (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const item = (data.items || [])[0];
  if (!item) return null;
  return { id: item.id.videoId, title: decodeHtmlEntities(item.snippet.title), channel: decodeHtmlEntities(item.snippet.channelTitle) };
}

function setImportProgress(ratio) {
  importProgress.classList.toggle("on", ratio > 0);
  if (motionOK()) {
    gsap.to(importProgressFill, { scaleX: ratio, duration: 0.3, ease: "power1.out", overwrite: true });
  } else {
    importProgressFill.style.transform = `scaleX(${ratio})`;
  }
}

// Ortak aktarım: şarkı adlarını YouTube'da bulur, yeni bir çalma listesi oluşturur.
async function importTracks(tracks, playlistName) {
  const ytKey = getApiKey();
  if (!ytKey) {
    spotifyImportStatus.textContent = "Şarkıları YouTube'da bulmak için önce sol alttan YouTube API anahtarını kaydet.";
    return;
  }

  spotifyImportBtn.disabled = true;
  spotifyPasteBtn.disabled = true;
  setImportProgress(0);

  const newPlaylist = createPlaylist(playlistName);
  let done = 0;
  let matched = 0;
  let stoppedMsg = "";

  for (const t of tracks) {
    done++;
    spotifyImportStatus.textContent = `Aranıyor: ${done}/${tracks.length}, ${matched} şarkı bulundu`;
    setImportProgress(done / tracks.length);
    const query = t.artist
      ? `${cleanTitleForSearch(t.artist)} - ${cleanTitleForSearch(t.name)}`
      : cleanTitleForSearch(t.name);
    try {
      const found = await findYoutubeIdForTrack(query, ytKey);
      if (found) {
        const song = { id: found.id, title: found.title, channel: t.artist || found.channel, genre: "benim" };
        saveUserSong(song);
        addSongToPlaylist(newPlaylist.id, song);
        matched++;
      }
    } catch (err) {
      // Kota bitti ya da anahtar geçersizse devam etmenin anlamı yok.
      if (err.status === 403 || err.status === 400) {
        stoppedMsg = ` YouTube şunu dedi: ${err.message}`;
        break;
      }
    }
  }

  renderPlaylistNav();
  const suffix = stoppedMsg ? ` ${done - 1}/${tracks.length} şarkıda durdu.${stoppedMsg}` : "";
  spotifyImportStatus.textContent = `"${playlistName}" listesine ${matched}/${tracks.length} şarkı eklendi.${suffix}`;
  spotifyImportBtn.disabled = false;
  spotifyPasteBtn.disabled = false;
  if (matched) selectPlaylist(newPlaylist.id, newPlaylist.name);
}

async function doSpotifyImport() {
  const link = spotifyImportInput.value.trim();
  const playlistId = extractSpotifyPlaylistId(link);

  if (!playlistId) {
    spotifyImportStatus.textContent = "Geçerli bir Spotify çalma listesi linki yapıştır (open.spotify.com/playlist/...).";
    return;
  }
  if (!getApiKey()) {
    spotifyImportStatus.textContent = "Şarkıları YouTube'da bulmak için önce sol alttan YouTube API anahtarını kaydet.";
    return;
  }

  spotifyImportBtn.disabled = true;
  spotifyPasteBox.hidden = true;
  setImportProgress(0);
  spotifyImportStatus.textContent = "Çalma listesi okunuyor...";

  let parsed = null;
  try {
    const html = await fetchSpotifyEmbedHtml(playlistId);
    parsed = parseSpotifyEmbed(html);
  } catch (_) {
    parsed = null;
  }

  if (!parsed || !parsed.tracks.length) {
    spotifyImportBtn.disabled = false;
    spotifyImportStatus.textContent = "Liste okunamadı. Liste herkese açık olmayabilir ya da okuma servisi cevap vermedi. Şarkıları aşağıya yapıştırarak aktarabilirsin.";
    spotifyPasteBox.hidden = false;
    return;
  }

  const playlistName = parsed.name || "Spotify listesi " + new Date().toLocaleDateString("tr-TR");
  spotifyImportBtn.disabled = false;
  await importTracks(parsed.tracks, playlistName);
  spotifyImportInput.value = "";
}

async function doPasteImport() {
  const lines = spotifyPasteInput.value
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (!lines.length) {
    spotifyImportStatus.textContent = "Önce en az bir şarkı yaz. Her satıra bir şarkı: Sanatçı - Şarkı adı.";
    return;
  }
  const tracks = lines.map(l => ({ name: l, artist: "" }));
  await importTracks(tracks, "Aktarılan liste " + new Date().toLocaleDateString("tr-TR"));
  spotifyPasteInput.value = "";
}

init();
