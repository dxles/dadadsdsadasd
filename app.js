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
  miniInfoLink.href = `player.html?v=${encodeURIComponent(np.id)}`;

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
const refreshBtn = document.getElementById("refreshBtn");
const addSongBtn = document.getElementById("addSongBtn");
const addModal = document.getElementById("addModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const addSearchInput = document.getElementById("addSearchInput");
const addSearchBtn = document.getElementById("addSearchBtn");
const addResults = document.getElementById("addResults");
const newPlaylistBtn = document.getElementById("newPlaylistBtn");
const playlistList = document.getElementById("playlistList");
const dailyGrid = document.getElementById("dailyGrid");
const homePlaylistsGrid = document.getElementById("homePlaylistsGrid");
const googleConnectBtn = document.getElementById("googleConnectBtn");
const spotifyConnectBtn = document.getElementById("spotifyConnectBtn");
const googleConnectLabel = document.getElementById("googleConnectLabel");
const spotifyConnectLabel = document.getElementById("spotifyConnectLabel");
const connectionStatus = document.getElementById("connectionStatus");
let remoteCollections = [];

function readRemoteCollections() {
  try { return JSON.parse(localStorage.getItem("cinla_remote_collections") || "[]"); } catch { return []; }
}
function saveRemoteCollections(collections) {
  remoteCollections = collections;
  localStorage.setItem("cinla_remote_collections", JSON.stringify(collections.map(({ songs, ...meta }) => meta)));
}
function renderHomeCollections() {
  if (!homePlaylistsGrid) return;
  homePlaylistsGrid.innerHTML = "";
  if (!remoteCollections.length) {
    homePlaylistsGrid.innerHTML = `<div class="daily-placeholder">Google veya Spotify hesabını bağlayınca listelerin burada görünür.</div>`;
    return;
  }
  remoteCollections.forEach(collection => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "home-playlist-card";
    const art = collection.image
      ? `<img src="${escapeHtml(collection.image)}" alt="" loading="lazy">`
      : `<span class="home-playlist-art ${collection.source.startsWith("spotify") ? "spotify-art" : "youtube-art"}" aria-hidden="true">${collection.source.startsWith("spotify") ? "♫" : "▶"}</span>`;
    card.innerHTML = `${art}<span class="home-playlist-name">${escapeHtml(collection.name)}</span><small>${collection.count || 0} şarkı · ${collection.source.startsWith("spotify") ? "Spotify" : "YouTube Music"}</small>`;
    card.addEventListener("click", () => selectPlaylist(collection.id, collection.name));
    homePlaylistsGrid.appendChild(card);
  });
}
function uniqueSongs(songs) { return [...new Map(songs.filter(Boolean).map(song => [song.id, song])).values()]; }

async function connectGoogleAndSync() {
  googleConnectBtn.disabled = true;
  try {
    connectionStatus.textContent = "Google hesabı bağlanıyor…";
    await CinlaGoogle.getGoogleAccessToken(!CinlaGoogle.isConnected());
    googleConnectLabel.textContent = "Google bağlı · yenile";
    await syncYouTubeCollections();
    await loadDailyHits();
  } catch (error) { connectionStatus.textContent = error.message; }
  finally { googleConnectBtn.disabled = false; }
}

async function fetchYouTubePages(url) {
  const result = [];
  let next = url;
  while (next) {
    const response = await CinlaGoogle.youtubeFetch(next);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "YouTube isteği başarısız.");
    result.push(...(data.items || []));
    next = data.nextPageToken ? `${url}&pageToken=${encodeURIComponent(data.nextPageToken)}` : "";
  }
  return result;
}

async function fetchSpotifyPages(url) {
  const items = [];
  let next = url;
  while (next) {
    const response = await CinlaSpotify.spotifyFetch(next);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Spotify verileri yüklenemedi.");
    items.push(...(data.items || []));
    next = data.next || "";
  }
  return items;
}

async function onlyMusicVideos(songs) {
  const valid = [];
  for (let i = 0; i < songs.length; i += 50) {
    const batch = songs.slice(i, i + 50);
    const ids = batch.map(song => song.id).join(",");
    if (!ids) continue;
    const response = await CinlaGoogle.youtubeFetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(ids)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Video türü doğrulanamadı.");
    const music = new Set((data.items || []).filter(item => item.snippet?.categoryId === "10").map(item => item.id));
    valid.push(...batch.filter(song => music.has(song.id)));
  }
  const approved = uniqueSongs(valid);
  markMusicVideoIds(approved.map(song => song.id));
  return approved;
}

async function loadYouTubePlaylistSongs(playlistId) {
  const items = await fetchYouTubePages(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50`);
  const songs = items.map(item => ({
    id: item.snippet?.resourceId?.videoId,
    title: decodeHtmlEntities(item.snippet?.title || ""),
    channel: decodeHtmlEntities(item.snippet?.videoOwnerChannelTitle || item.snippet?.channelTitle || ""),
    thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
    genre: "benim",
  })).filter(song => song.id && song.title !== "Deleted video" && song.title !== "Private video");
  return onlyMusicVideos(songs);
}

async function syncYouTubeCollections() {
  connectionStatus.textContent = "YouTube Music listelerin ve beğenilerin yükleniyor…";
  const [playlistItems, likedItems] = await Promise.all([
    fetchYouTubePages("https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50"),
    fetchYouTubePages("https://www.googleapis.com/youtube/v3/videos?part=snippet&myRating=like&maxResults=50"),
  ]);
  const collections = playlistItems.map(item => ({ id: `yt_${item.id}`, source: "youtube", remoteId: item.id, name: item.snippet?.title || "YouTube listesi", count: item.contentDetails?.itemCount || 0, image: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url, songs: [] }));
  const likes = await onlyMusicVideos(likedItems.map(item => ({ id: item.id, title: decodeHtmlEntities(item.snippet?.title || ""), channel: decodeHtmlEntities(item.snippet?.channelTitle || ""), thumbnail: item.snippet?.thumbnails?.medium?.url, genre: "benim" })));
  collections.unshift({ id: "yt_liked", source: "youtube-liked", name: "YouTube’da beğendiklerim", count: likes.length, songs: likes });
  remoteCollections = [...readRemoteCollections().filter(item => item.source?.startsWith("spotify")), ...collections];
  saveRemoteCollections(remoteCollections);
  renderPlaylistNav();
  connectionStatus.textContent = `${collections.length - 1} YouTube listesi ve ${likes.length} müzik beğenisi eşitlendi. Oyun videoları gizlendi.`;
}

async function loadYouTubeLikedSongs() {
  const items = await fetchYouTubePages("https://www.googleapis.com/youtube/v3/videos?part=snippet&myRating=like&maxResults=50");
  return onlyMusicVideos(items.map(item => ({ id: item.id, title: decodeHtmlEntities(item.snippet?.title || ""), channel: decodeHtmlEntities(item.snippet?.channelTitle || ""), thumbnail: item.snippet?.thumbnails?.medium?.url, genre: "benim" })));
}

async function loadDailyHits() {
  dailyGrid.innerHTML = `<div class="daily-placeholder">Türkiye müzik listesi yükleniyor…</div>`;
  const response = await CinlaGoogle.youtubeFetch("https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&regionCode=TR&videoCategoryId=10&maxResults=12");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Günlük müzik listesi yüklenemedi.");
  const songs = (data.items || []).map(item => ({ id: item.id, title: decodeHtmlEntities(item.snippet.title), channel: decodeHtmlEntities(item.snippet.channelTitle), thumbnail: item.snippet.thumbnails?.medium?.url, genre: "pop" }));
  markMusicVideoIds(songs.map(song => song.id));
  renderDailyGrid(songs);
}

function renderDailyGrid(songs) {
  dailyGrid.innerHTML = "";
  songs.forEach((song, index) => {
    const card = document.createElement("a");
    card.className = "daily-card";
    card.href = `player.html?v=${encodeURIComponent(song.id)}`;
    card.innerHTML = `<span class="daily-rank">${String(index + 1).padStart(2, "0")}</span><img src="${escapeHtml(song.thumbnail || `https://i.ytimg.com/vi/${song.id}/mqdefault.jpg`)}" alt="" loading="lazy"><span class="daily-track"><strong>${escapeHtml(song.title)}</strong><small>${escapeHtml(song.channel)}</small></span><span class="daily-play">▶</span>`;
    card.addEventListener("click", () => saveQueue(songs, "Türkiye günlük müzik listesi"));
    dailyGrid.appendChild(card);
  });
}

async function connectSpotifyAndSync() {
  try {
    await CinlaSpotify.ready;
    if (!CinlaSpotify.isConnected()) { await CinlaSpotify.connectSpotify(); return; }
    connectionStatus.textContent = "Spotify listelerin ve beğenilerin yükleniyor…";
    const [playlistItems, savedItems] = await Promise.all([
      fetchSpotifyPages("https://api.spotify.com/v1/me/playlists?limit=50"),
      fetchSpotifyPages("https://api.spotify.com/v1/me/tracks?limit=50"),
    ]);
    const collections = playlistItems.map(item => ({ id: `sp_${item.id}`, source: "spotify", remoteId: item.id, name: item.name, count: item.items?.total || item.tracks?.total || 0, image: item.images?.[0]?.url, externalUrl: item.external_urls?.spotify, songs: [] }));
    const liked = savedItems.map(row => spotifyTrackToSong(row.track || row.item)).filter(Boolean);
    collections.unshift({ id: "sp_liked", source: "spotify-liked", name: "Spotify’da beğendiklerim", count: liked.length, songs: liked });
    remoteCollections = [...readRemoteCollections().filter(item => item.source?.startsWith("youtube")), ...collections];
    saveRemoteCollections(remoteCollections);
    renderPlaylistNav();
    connectionStatus.textContent = `${collections.length - 1} Spotify listesi ve ${liked.length} beğeni yüklendi.`;
    spotifyConnectLabel.textContent = "Spotify bağlı · yenile";
  } catch (error) { connectionStatus.textContent = error.message; }
}

function spotifyTrackToSong(track) {
  if (!track?.id) return null;
  return { id: `spotify_${track.id}`, source: "spotify", externalUrl: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`, thumbnail: track.album?.images?.[0]?.url || "", title: track.name || "İsimsiz şarkı", channel: (track.artists || []).map(artist => artist.name).join(", "), genre: "benim" };
}

async function loadSpotifyPlaylistSongs(collection) {
  const songs = [];
  let url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(collection.remoteId)}/items?limit=50`;
  while (url) {
    const response = await CinlaSpotify.spotifyFetch(url);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Spotify listesi okunamadı.");
    songs.push(...(data.items || []).map(row => spotifyTrackToSong(row.item)).filter(Boolean));
    url = data.next || "";
  }
  return songs;
}
const contentEl = document.getElementById("content");
const featurePlayBtn = document.getElementById("featurePlayBtn");
const featureRadioBtn = document.getElementById("featureRadioBtn");
const featureExploreBtn = document.getElementById("featureExploreBtn");
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
  remoteCollections = readRemoteCollections();

  const cached = getCachedSongs();
  allSongs = cached && cached.length ? cached : SEED_SONGS.slice();
  markMusicVideoIds(allSongs.map(song => song.id));

  renderPlaylistNav();
  renderGrid();
  initMiniPlayer();
  if (CinlaGoogle.isConnected()) googleConnectLabel.textContent = "Google bağlı · eşitle";

  featurePlayBtn?.addEventListener("click", () => {
    const firstSong = lastRenderedSongs[0];
    if (!firstSong) {
      setStatus("Önce koleksiyonuna birkaç şarkı ekle.");
      return;
    }
    if (firstSong.source === "spotify") { window.open(firstSong.externalUrl, "_blank", "noopener"); return; }
    saveQueue(lastRenderedSongs);
    window.location.href = `player.html?v=${encodeURIComponent(firstSong.id)}`;
  });
  featureRadioBtn?.addEventListener("click", () => {
    const pool = uniqueSongs([...allSongs, ...getUserSongs(), ...remoteCollections.filter(item => item.source.startsWith("youtube")).flatMap(item => item.songs || [])]).filter(song => song.source !== "spotify" && isApprovedMusicVideo(song.id));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    if (!pool.length) { setStatus("Karışık radyo için müzik bulunamadı."); return; }
    saveQueue(pool, "Karışık radyo");
    window.location.href = `player.html?v=${encodeURIComponent(pool[0].id)}`;
  });
  featureExploreBtn?.addEventListener("click", () => {
    document.getElementById("songGrid")?.scrollIntoView({ behavior: motionOK() ? "smooth" : "auto", block: "start" });
  });

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
    if (link.classList.contains("external-track-link")) return;
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


  refreshBtn.addEventListener("click", refreshFromYouTube);
  googleConnectBtn?.addEventListener("click", connectGoogleAndSync);
  spotifyConnectBtn?.addEventListener("click", connectSpotifyAndSync);
  if (CinlaSpotify.isConnected()) spotifyConnectLabel.textContent = "Spotify bağlı · eşitle";
  CinlaSpotify.ready.catch(error => { if (connectionStatus) connectionStatus.textContent = error.message; });
  CinlaSpotify.ready.then(() => {
    if (sessionStorage.getItem("cinla_spotify_just_connected") === "1") {
      sessionStorage.removeItem("cinla_spotify_just_connected");
      connectSpotifyAndSync();
    }
  }).catch(() => {});

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

  // ---- Ayarlar: şarkı sözü animasyonu seçimi + canlı önizleme ----
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const lyricsStyleGrid = document.getElementById("lyricsStyleGrid");

  // Önizleme için örnek (telifsiz, bize ait) sözler
  const PREVIEW_LINES = [
    { time: 0,    text: "Gece uzar, yollar sonsuz" },
    { time: 2.6,  text: "Şehir uyur, sen uyanık" },
    { time: 5.2,  text: "" },
    { time: 7.2,  text: "Bir şarkı çal, dön geriye" },
    { time: 9.8,  text: "Yıldızlar bizi bilir" },
    { time: 12.4, text: "Çınla, çınla, hiç susma" },
    { time: 15,   text: "Sesin bende kalır" },
  ];
  const PREVIEW_LOOP = 18;
  let previewRenderers = [];
  let previewTimer = null;

  function renderLyricsStyleCards() {
    const active = getLyricsStyle();
    lyricsStyleGrid.innerHTML = "";
    previewRenderers = [];
    LYRICS_STYLES.forEach(st => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "lyrics-style-card" + (st.id === active ? " selected" : "");
      card.dataset.style = st.id;
      card.setAttribute("role", "radio");
      card.setAttribute("aria-checked", st.id === active ? "true" : "false");
      card.innerHTML = `
        <div class="lyrics-preview lyrics-preview-${st.id}"><div class="lyrics-preview-host"></div></div>
        <div class="lyrics-style-meta">
          <span class="lyrics-style-name">${escapeHtml(st.name)}</span>
          <span class="lyrics-style-desc">${escapeHtml(st.desc)}</span>
        </div>`;
      card.addEventListener("click", () => {
        setLyricsStyle(st.id);
        lyricsStyleGrid.querySelectorAll(".lyrics-style-card").forEach(c => {
          const on = c === card;
          c.classList.toggle("selected", on);
          c.setAttribute("aria-checked", on ? "true" : "false");
        });
      });
      lyricsStyleGrid.appendChild(card);

      const r = new LyricsRenderer(card.querySelector(".lyrics-preview-host"), { style: st.id, compact: true });
      r.setLines(PREVIEW_LINES);
      previewRenderers.push(r);
    });
  }

  // Kaynak listesi: sıra (▲▼) + aç/kapa
  const providerListEl = document.getElementById("providerList");
  function renderProviderList() {
    const cfg = getLyricsProviderConfig();
    providerListEl.innerHTML = "";
    cfg.order.forEach((id, i) => {
      const meta = LYRICS_PROVIDER_META.find(p => p.id === id);
      if (!meta) return;
      const on = !cfg.off.includes(id);
      const row = document.createElement("div");
      row.className = "provider-row" + (on ? "" : " is-off");
      row.innerHTML = `
        <div class="provider-move">
          <button type="button" class="icon-btn" data-dir="-1" aria-label="Yukarı taşı" ${i === 0 ? "disabled" : ""}>▲</button>
          <button type="button" class="icon-btn" data-dir="1" aria-label="Aşağı taşı" ${i === cfg.order.length - 1 ? "disabled" : ""}>▼</button>
        </div>
        <label class="provider-main">
          <input type="checkbox" class="provider-toggle" ${on ? "checked" : ""}>
          <span class="provider-switch" aria-hidden="true"></span>
          <span class="provider-text">
            <span class="provider-name">${escapeHtml(meta.name)}</span>
            <span class="provider-desc">${escapeHtml(meta.desc)}</span>
          </span>
        </label>
        <span class="provider-pos">${i + 1}</span>`;
      row.querySelector(".provider-toggle").addEventListener("change", e => {
        const c = getLyricsProviderConfig();
        c.off = c.off.filter(x => x !== id);
        if (!e.target.checked) c.off.push(id);
        saveLyricsProviderConfig(c);
        renderProviderList();
      });
      row.querySelectorAll(".provider-move .icon-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const c = getLyricsProviderConfig();
          const from = c.order.indexOf(id);
          const to = from + Number(btn.dataset.dir);
          if (to < 0 || to >= c.order.length) return;
          c.order.splice(to, 0, c.order.splice(from, 1)[0]);
          saveLyricsProviderConfig(c);
          renderProviderList();
        });
      });
      providerListEl.appendChild(row);
    });
  }

  // Oynatıcı düzeni: küçük tel kafes önizlemeli kartlar
  const layoutGrid = document.getElementById("layoutGrid");
  const LAYOUT_WIRES = {
    auto: `<span class="w-auto">Söz stiline<br>uyar</span>`,
    classic: `<i class="w-cover" style="left:8%;top:28%;width:30%;height:44%"></i><i class="w-line" style="left:44%;top:34%;width:44%"></i><i class="w-line s" style="left:44%;top:46%;width:28%"></i><i class="w-bar" style="left:44%;top:62%;width:44%"></i>`,
    spotify: `<i class="w-cover" style="left:6%;top:56%;width:12%;height:20%"></i><i class="w-line" style="left:21%;top:60%;width:26%"></i><i class="w-line s" style="left:21%;top:70%;width:16%"></i><i class="w-bar" style="left:6%;top:84%;width:88%"></i>`,
    apple: `<i class="w-cover" style="left:10%;top:10%;width:34%;height:50%;border-radius:6px"></i><i class="w-bar" style="left:10%;top:66%;width:34%"></i><i class="w-line" style="left:18%;top:76%;width:18%"></i><i class="w-line s" style="left:20%;top:86%;width:14%"></i>`,
    soundcloud: `<i class="w-cover" style="left:6%;top:26%;width:26%;height:48%;border-radius:1px"></i><i class="w-tag" style="left:36%;top:28%;width:22%"></i><i class="w-tag lt" style="left:36%;top:38%;width:50%"></i><i class="w-wave" style="left:36%;top:54%;width:56%"></i>`,
  };

  function renderLayoutCards() {
    const active = getPlayerLayout();
    layoutGrid.innerHTML = "";
    PLAYER_LAYOUTS.forEach(l => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "layout-card" + (l.id === active ? " selected" : "");
      card.setAttribute("role", "radio");
      card.setAttribute("aria-checked", l.id === active ? "true" : "false");
      card.innerHTML = `
        <div class="layout-wire layout-wire-${l.id}">${LAYOUT_WIRES[l.id] || ""}</div>
        <span class="lyrics-style-name">${escapeHtml(l.name)}</span>
        <span class="lyrics-style-desc">${escapeHtml(l.desc)}</span>`;
      card.addEventListener("click", () => {
        setPlayerLayout(l.id);
        renderLayoutCards();
      });
      layoutGrid.appendChild(card);
    });
  }

  function startPreviewClock() {
    stopPreviewClock();
    const t0 = performance.now();
    const tick = () => {
      const t = ((performance.now() - t0) / 1000) % PREVIEW_LOOP;
      previewRenderers.forEach(r => r.update(t));
    };
    tick();
    previewTimer = setInterval(tick, 120);
  }

  function stopPreviewClock() {
    clearInterval(previewTimer);
    previewTimer = null;
  }

  // Karadeo (yapay zekâ söz): anahtar + isteğe bağlı proxy
  const kKeyInput = document.getElementById("karadeoKeyInput");
  const kKeyInfo = document.getElementById("karadeoKeyInfo");
  const kProxyInput = document.getElementById("karadeoProxyInput");
  function renderKaradeoSettings() {
    const k = getKaradeoKey();
    kKeyInput.value = "";
    kKeyInfo.textContent = k ? `Anahtar kayıtlı (…${k.slice(-4)}). Sadece bu tarayıcıda saklanır.` : "Henüz anahtar yok.";
    kProxyInput.value = getKaradeoProxy();
  }
  document.getElementById("karadeoKeySave").addEventListener("click", () => {
    const v = kKeyInput.value.trim();
    if (!v) return;
    setKaradeoKey(v);
    renderKaradeoSettings();
  });
  document.getElementById("karadeoKeyClear").addEventListener("click", () => { setKaradeoKey(""); renderKaradeoSettings(); });
  document.getElementById("karadeoProxySave").addEventListener("click", () => {
    const v = kProxyInput.value.trim();
    if (v && !/^https:\/\//i.test(v)) { kProxyInput.setCustomValidity("https:// ile başlamalı"); kProxyInput.reportValidity(); return; }
    kProxyInput.setCustomValidity("");
    setKaradeoProxy(v);
    renderKaradeoSettings();
  });

  function openSettings() {
    renderKaradeoSettings();
    renderProviderList();
    renderLayoutCards();
    settingsModal.classList.remove("hidden");
    renderLyricsStyleCards();
    startPreviewClock();
    if (motionOK()) {
      gsap.fromTo(settingsModal, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      gsap.fromTo(settingsModal.querySelector(".modal-box"), { opacity: 0, y: 12, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "power2.out" });
    }
  }

  function closeSettings() {
    stopPreviewClock();
    const finish = () => {
      settingsModal.classList.add("hidden");
      previewRenderers.forEach(r => r.destroy());
      previewRenderers = [];
    };
    if (motionOK()) {
      gsap.to(settingsModal.querySelector(".modal-box"), { opacity: 0, y: 8, scale: 0.97, duration: 0.2, ease: "power1.in" });
      gsap.to(settingsModal, { opacity: 0, duration: 0.2, onComplete: finish });
    } else {
      finish();
    }
  }

  settingsBtn.addEventListener("click", openSettings);
  closeSettingsBtn.addEventListener("click", closeSettings);
  settingsModal.addEventListener("click", e => { if (e.target === settingsModal) closeSettings(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !settingsModal.classList.contains("hidden")) closeSettings();
  });

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
  const remote = remoteCollections.find(item => item.id === id);
  if (remote && !remote.songs?.length && remote.source === "youtube") {
    setStatus("YouTube Music listesi yükleniyor…");
    loadYouTubePlaylistSongs(remote.remoteId).then(songs => {
      remote.songs = songs;
      saveRemoteCollections(remoteCollections);
      setStatus(`${songs.length} müzik videosu yüklendi. Oyun videoları listelenmedi.`);
      renderGrid();
    }).catch(error => setStatus(error.message));
  } else if (remote && !remote.songs?.length && remote.source === "youtube-liked") {
    setStatus("Müzik beğenilerin yükleniyor…");
    loadYouTubeLikedSongs().then(songs => { remote.songs = songs; setStatus(`${songs.length} müzik beğenisi yüklendi.`); renderGrid(); }).catch(error => setStatus(error.message));
  } else if (remote && !remote.songs?.length && remote.source === "spotify") {
    setStatus("Spotify listesi yükleniyor…");
    loadSpotifyPlaylistSongs(remote).then(songs => {
      remote.songs = songs;
      setStatus(`${songs.length} Spotify parçası listelendi.`);
      renderGrid();
    }).catch(error => setStatus(error.message));
  } else if (remote && !remote.songs?.length && remote.source === "spotify-liked") {
    setStatus("Spotify beğenilerin yükleniyor…");
    fetchSpotifyPages("https://api.spotify.com/v1/me/tracks?limit=50").then(rows => { remote.songs = rows.map(row => spotifyTrackToSong(row.track || row.item)).filter(Boolean); setStatus(`${remote.songs.length} Spotify beğenisi listelendi.`); renderGrid(); }).catch(error => setStatus(error.message));
  } else renderGrid();
  scrollContentToTop();
}

// ---- Sidebar: çalma listeleri ----
function renderPlaylistNav() {
  remoteCollections = remoteCollections.length ? remoteCollections : readRemoteCollections();
  const playlists = getPlaylists();
  if (!playlists.length && !remoteCollections.length) {
    playlistList.innerHTML = `<div class="playlist-empty-hint">Henüz çalma listen yok.</div>`;
    renderHomeCollections();
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
  remoteCollections.forEach(collection => {
    const row = document.createElement("div");
    row.className = "playlist-item remote-playlist-item";
    row.dataset.playlistId = collection.id;
    const provider = collection.source.startsWith("spotify") ? "SP" : "YT";
    row.innerHTML = `<button class="playlist-btn" data-playlist-id="${escapeHtml(collection.id)}"><span class="remote-provider">${provider}</span>${escapeHtml(collection.name)}</button>`;
    row.querySelector(".playlist-btn").addEventListener("click", () => selectPlaylist(collection.id, collection.name));
    playlistList.appendChild(row);
  });
  renderHomeCollections();
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
  } else if (currentGenre.startsWith("yt_") || currentGenre.startsWith("sp_")) {
    const collection = remoteCollections.find(item => item.id === currentGenre);
    songs = collection?.songs || [];
  } else {
    songs = [...userSongs, ...allSongs].filter(s => s.genre === currentGenre);
  }

  songs = songs.filter(song => song.source === "spotify" || isApprovedMusicVideo(song.id));
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
    const thumb = song.thumbnail || `https://i.ytimg.com/vi/${encodeURIComponent(song.id)}/mqdefault.jpg`;
    const isExternal = song.source === "spotify";
    const songHref = isExternal ? song.externalUrl : `player.html?v=${encodeURIComponent(song.id)}`;
    card.innerHTML = `
      <a class="song-card-link${isExternal ? " external-track-link" : ""}" href="${escapeHtml(songHref)}" ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ""}>
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
  // Üstteki arama kutusuna link yapıştırılırsa "Şarkı ekle" penceresinde aç
  if (extractYouTubeId(searchInput.value)) {
    addSongBtn.click();
    addSearchInput.value = searchInput.value.trim();
    doAddSearch();
    return;
  }
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
  setStatus("YouTube Music'ten Türkçe şarkılar aranıyor…");
  refreshBtn.disabled = true;
  const queries = [
    { q: "türkçe rap official music video", genre: "rap" },
    { q: "türkçe arabesk official music video", genre: "arabesk" },
    { q: "türkçe pop official music video", genre: "pop" },
  ];
  try {
    const results = [];
    for (const item of queries) {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=12&regionCode=TR&relevanceLanguage=tr&q=${encodeURIComponent(item.q)}`;
      const res = await CinlaGoogle.youtubeFetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `YouTube API hatası (${res.status})`);
      (data.items || []).forEach(v => results.push({ id: v.id.videoId, title: decodeHtmlEntities(v.snippet.title), channel: decodeHtmlEntities(v.snippet.channelTitle), genre: item.genre }));
    }
    allSongs = uniqueSongs(results);
    markMusicVideoIds(allSongs.map(song => song.id));
    setCachedSongs(allSongs);
    setStatus(`${allSongs.length} müzik videosu bulundu.`);
    renderGrid();
  } catch (err) { setStatus(err.message); }
  finally { refreshBtn.disabled = false; }
}

// ---- Şarkı ekleme modalı: YouTube araması ----
// Yapıştırılan YouTube linkinden videoyu bul (API anahtarı varsa YouTube'dan, yoksa oEmbed'den)
async function showLinkResult(id) {
  addResults.innerHTML = `<p class="note">Müzik kategorisi doğrulanıyor…</p>`;
  try {
    const response = await CinlaGoogle.youtubeFetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(id)}`);
    const data = await response.json();
    const video = data.items?.[0];
    if (!response.ok) throw new Error(data.error?.message || "YouTube videosu doğrulanamadı.");
    if (!video || video.snippet?.categoryId !== "10") throw new Error("Bu içerik müzik kategorisinde değil; klip dışı videolar oynatma listesine eklenmiyor.");
    const title = decodeHtmlEntities(video.snippet.title);
    const channel = decodeHtmlEntities(video.snippet.channelTitle);
    addResults.innerHTML = `<div class="add-result-item"><img src="https://i.ytimg.com/vi/${encodeURIComponent(id)}/default.jpg" alt=""><div class="info"><p>${escapeHtml(title)}</p><p class="sub">${escapeHtml(channel)}</p></div><a class="btn btn-quiet btn-small" href="player.html?v=${encodeURIComponent(id)}">Çal</a><button class="btn btn-primary btn-small">Ekle</button></div>`;
    markMusicVideoIds([id]);
    addResults.querySelector("button").addEventListener("click", () => { saveUserSong({ id, title, channel, genre: "benim" }); renderGrid(); });
  } catch (error) { addResults.innerHTML = `<p class="note">${escapeHtml(error.message)}</p>`; }
}

async function doAddSearch() {
  const q = addSearchInput.value.trim();
  if (!q) return;
  const linkId = extractYouTubeId(q);
  if (linkId) { await showLinkResult(linkId); return; }
  addResults.innerHTML = `<p class="note">Yalnızca müzik kategorisindeki videolar aranıyor…</p>`;
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=10&q=${encodeURIComponent(q)}`;
    const response = await CinlaGoogle.youtubeFetch(url);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `YouTube API hatası (${response.status})`);
    const items = data.items || [];
    if (!items.length) { addResults.innerHTML = `<p class="note">Müzik kategorisinde sonuç bulunamadı.</p>`; return; }
    addResults.innerHTML = "";
    items.forEach(video => {
      const id = video.id.videoId;
      const title = decodeHtmlEntities(video.snippet.title);
      const channel = decodeHtmlEntities(video.snippet.channelTitle);
      const row = document.createElement("div");
      row.className = "add-result-item";
      row.innerHTML = `<img src="${escapeHtml(video.snippet.thumbnails?.default?.url || `https://i.ytimg.com/vi/${id}/default.jpg`)}" alt=""><div class="info"><p>${escapeHtml(title)}</p><p class="sub">${escapeHtml(channel)}</p></div><button class="btn btn-primary btn-small">Ekle</button>`;
      markMusicVideoIds([id]);
      row.querySelector("button").addEventListener("click", () => { saveUserSong({ id, title, channel, genre: "benim" }); row.querySelector("button").textContent = "Eklendi"; row.querySelector("button").disabled = true; renderGrid(); });
      addResults.appendChild(row);
    });
  } catch (error) { addResults.innerHTML = `<p class="note">${escapeHtml(error.message)}</p>`; }
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

async function findYoutubeIdForTrack(query) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=1&q=${encodeURIComponent(query)}`;
  const res = await CinlaGoogle.youtubeFetch(url);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const err = new Error(errBody.error?.message || `YouTube API hatası (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const item = (data.items || [])[0];
  if (!item) return null;
  markMusicVideoIds([item.id.videoId]);
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
  try { await CinlaGoogle.getGoogleAccessToken(false); }
  catch (error) { spotifyImportStatus.textContent = error.message; return; }

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
      const found = await findYoutubeIdForTrack(query);
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


// Header account menu keeps Google and Spotify connections close at hand.
(() => {
  const button = document.getElementById("profileMenuBtn");
  const menu = document.getElementById("accountMenu");
  if (!button || !menu) return;
  button.addEventListener("click", event => { event.stopPropagation(); menu.hidden = !menu.hidden; button.setAttribute("aria-expanded", String(!menu.hidden)); });
  document.addEventListener("click", event => { if (!menu.hidden && !menu.contains(event.target) && !button.contains(event.target)) { menu.hidden = true; button.setAttribute("aria-expanded", "false"); } });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !menu.hidden) { menu.hidden = true; button.setAttribute("aria-expanded", "false"); button.focus(); } });
})();
