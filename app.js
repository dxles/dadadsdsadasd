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

  miniCover.src = `https://i.ytimg.com/vi/${np.id}/mqdefault.jpg`;
  miniTitle.textContent = np.title || "Bilinmeyen Şarkı";
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
        miniPlayBtn.textContent = "▶";
      }
      miniSaveInterval = setInterval(writeMiniProgress, 1000);
    },
    onStateChange: (e) => {
      if (e.data === YT.PlayerState.PLAYING) {
        miniIsPlaying = true;
        miniPlayBtn.textContent = "❚❚";
        startMiniEqualizer();
      } else if (e.data === YT.PlayerState.PAUSED) {
        miniIsPlaying = false;
        miniPlayBtn.textContent = "▶";
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
const spotifyClientIdInput = document.getElementById("spotifyClientId");
const spotifyClientSecretInput = document.getElementById("spotifyClientSecret");
const saveSpotifyBtn = document.getElementById("saveSpotifyBtn");
const spotifyImportInput = document.getElementById("spotifyImportInput");
const spotifyImportBtn = document.getElementById("spotifyImportBtn");
const spotifyImportStatus = document.getElementById("spotifyImportStatus");

// ---- Başlangıç ----
function init() {
  apiKeyInput.value = getApiKey();
  const creds = getSpotifyCreds();
  spotifyClientIdInput.value = creds.id;
  spotifyClientSecretInput.value = creds.secret;

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
      sectionTitle.textContent = btn.textContent;
      renderGrid();
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

  saveSpotifyBtn.addEventListener("click", () => {
    setSpotifyCreds(spotifyClientIdInput.value.trim(), spotifyClientSecretInput.value.trim());
    setStatus("Spotify bilgileri kaydedildi.");
  });

  spotifyImportBtn.addEventListener("click", doSpotifyImport);
  spotifyImportInput.addEventListener("keydown", e => { if (e.key === "Enter") doSpotifyImport(); });

  if (window.gsap) {
    gsap.from(".sidebar", { x: -16, opacity: 0, duration: 0.45, ease: "power2.out" });
    gsap.from(".content-header, .status-bar", { y: -8, opacity: 0, duration: 0.4, ease: "power2.out", delay: 0.1 });
  }

  addSongBtn.addEventListener("click", () => {
    addModal.classList.remove("hidden");
    if (window.gsap) {
      gsap.fromTo(addModal, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      gsap.fromTo(".modal-box", { opacity: 0, y: 12, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "power2.out" });
    }
    addSearchInput.focus();
  });

  function closeAddModal() {
    if (window.gsap) {
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
    if (window.gsap) {
      gsap.fromTo(apiHelpModal, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      gsap.fromTo(apiHelpModal.querySelector(".modal-box"), { opacity: 0, y: 12, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "power2.out" });
    }
  }

  function closeApiHelp() {
    if (window.gsap) {
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
  sectionTitle.textContent = name;
  setActiveNav(null);
  const btn = playlistList.querySelector(`[data-playlist-id="${id}"] .playlist-btn`);
  if (btn) btn.classList.add("active");
  renderGrid();
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
        sectionTitle.textContent = "Hepsi";
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
    menu.innerHTML = `<span style="font-size:12px; color:var(--text-secondary); padding:6px 8px; display:block;">Henüz liste yok</span>`;
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

  const flipState = window.gsap && window.Flip ? Flip.getState(songGrid.children) : null;

  songGrid.innerHTML = "";

  if (!songs.length) {
    songGrid.innerHTML = `<div class="empty-state">Burada henüz şarkı yok. "+ Şarkı Ekle" ile kendi şarkını ekleyebilirsin.</div>`;
    return;
  }

  songs.forEach(song => {
    const card = document.createElement("div");
    card.className = "song-card";
    const thumb = `https://i.ytimg.com/vi/${song.id}/mqdefault.jpg`;
    card.innerHTML = `
      <button class="card-add-btn" title="Çalma listesine ekle">+</button>
      <a class="song-card-link" href="player.html?v=${encodeURIComponent(song.id)}&t=${encodeURIComponent(song.title)}&c=${encodeURIComponent(song.channel || "")}">
        <img src="${thumb}" alt="${escapeHtml(song.title)}" loading="lazy">
        <div class="song-card-info">
          <p class="song-card-title">${escapeHtml(song.title)}</p>
          <p class="song-card-channel">${escapeHtml(song.channel || "")}</p>
        </div>
      </a>
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

  if (window.gsap) {
    if (window.Flip && flipState) {
      Flip.from(flipState, { duration: 0.4, ease: "power2.out", absolute: false });
    }
    gsap.from(songGrid.children, {
      opacity: 0,
      y: 10,
      duration: 0.35,
      stagger: { each: 0.02, from: "start" },
      ease: "power1.out",
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
  sectionTitle.textContent = `"${searchInput.value.trim()}" için sonuçlar`;
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
    addResults.innerHTML = `<p style="color:var(--text-secondary); font-size:13px;">Arama yapmak için önce sol alttan YouTube API anahtarını kaydet.</p>`;
    return;
  }

  addResults.innerHTML = `<p style="color:var(--text-secondary); font-size:13px;">Aranıyor...</p>`;

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
      addResults.innerHTML = `<p style="color:var(--text-secondary); font-size:13px;">Sonuç bulunamadı.</p>`;
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
        <button>Ekle</button>
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
    addResults.innerHTML = `<p style="color:var(--text-secondary); font-size:13px;">Hata: ${escapeHtml(err.message)}</p>`;
  }
}

// ---- Spotify çalma listesi içe aktarma ----
function extractSpotifyPlaylistId(url) {
  const m = (url || "").match(/playlist[/:]([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

async function getSpotifyToken(clientId, clientSecret) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Spotify token alınamadı (${res.status})`);
  const data = await res.json();
  return data.access_token;
}

async function fetchSpotifyPlaylistTracks(playlistId, token) {
  const tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Spotify çalma listesi alınamadı (${res.status})`);
    const data = await res.json();
    (data.items || []).forEach(item => {
      const t = item.track;
      if (!t) return;
      tracks.push({
        name: t.name,
        artist: (t.artists || []).map(a => a.name).join(", "),
      });
    });
    url = data.next;
  }
  return tracks;
}

async function findYoutubeIdForTrack(query, ytKey) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=1&q=${encodeURIComponent(query)}&key=${ytKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const item = (data.items || [])[0];
  if (!item) return null;
  return { id: item.id.videoId, title: decodeHtmlEntities(item.snippet.title), channel: decodeHtmlEntities(item.snippet.channelTitle) };
}

async function doSpotifyImport() {
  const link = spotifyImportInput.value.trim();
  const playlistId = extractSpotifyPlaylistId(link);
  const { id: clientId, secret: clientSecret } = getSpotifyCreds();
  const ytKey = getApiKey();

  if (!playlistId) {
    spotifyImportStatus.textContent = "Geçerli bir Spotify çalma listesi linki gir (open.spotify.com/playlist/...).";
    return;
  }
  if (!clientId || !clientSecret) {
    spotifyImportStatus.textContent = "Önce sol alttan Spotify Client ID / Secret bilgilerini kaydet.";
    return;
  }
  if (!ytKey) {
    spotifyImportStatus.textContent = "Şarkıları YouTube'da eşleştirmek için önce YouTube API anahtarını kaydet.";
    return;
  }

  spotifyImportBtn.disabled = true;
  spotifyImportStatus.textContent = "Spotify'a bağlanılıyor...";

  try {
    const token = await getSpotifyToken(clientId, clientSecret);
    spotifyImportStatus.textContent = "Çalma listesi okunuyor...";
    const tracks = await fetchSpotifyPlaylistTracks(playlistId, token);

    if (!tracks.length) {
      spotifyImportStatus.textContent = "Çalma listesinde şarkı bulunamadı.";
      return;
    }

    const playlistName = "Spotify İçe Aktarılan " + new Date().toLocaleDateString("tr-TR");
    const newPlaylist = createPlaylist(playlistName);

    let done = 0;
    let matched = 0;
    for (const t of tracks) {
      done++;
      spotifyImportStatus.textContent = `Eşleştiriliyor: ${done}/${tracks.length} (${matched} bulundu)`;
      const query = `${cleanTitleForSearch(t.artist)} - ${cleanTitleForSearch(t.name)}`;
      try {
        const found = await findYoutubeIdForTrack(query, ytKey);
        if (found) {
          const song = { id: found.id, title: found.title, channel: t.artist || found.channel, genre: "benim" };
          saveUserSong(song);
          addSongToPlaylist(newPlaylist.id, song);
          matched++;
        }
      } catch {
        // tek şarkı hatasında devam et
      }
    }

    renderPlaylistNav();
    spotifyImportStatus.textContent = `Tamamlandı: "${playlistName}" listesine ${matched}/${tracks.length} şarkı eklendi.`;
    spotifyImportInput.value = "";
    if (currentGenre === "benim" || currentGenre === "hepsi") renderGrid();
  } catch (err) {
    spotifyImportStatus.textContent = `Hata: ${err.message}`;
  } finally {
    spotifyImportBtn.disabled = false;
  }
}

init();
