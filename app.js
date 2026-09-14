// ---- Depolama yardımcıları ----
const STORAGE_KEYS = {
  apiKey: "cinla_yt_api_key",
  userSongs: "cinla_user_songs",
  cachedSongs: "cinla_cached_songs",
};

function getApiKey() {
  return localStorage.getItem(STORAGE_KEYS.apiKey) || "";
}

function getUserSongs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.userSongs) || "[]");
  } catch {
    return [];
  }
}

function saveUserSong(song) {
  const songs = getUserSongs();
  songs.unshift(song);
  localStorage.setItem(STORAGE_KEYS.userSongs, JSON.stringify(songs));
}

function getCachedSongs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.cachedSongs) || "null");
  } catch {
    return null;
  }
}

function setCachedSongs(songs) {
  localStorage.setItem(STORAGE_KEYS.cachedSongs, JSON.stringify(songs));
}

// ---- Durum ----
let currentGenre = "hepsi";
let allSongs = [];

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

// ---- Başlangıç ----
function init() {
  apiKeyInput.value = getApiKey();

  const cached = getCachedSongs();
  allSongs = cached && cached.length ? cached : SEED_SONGS.slice();

  renderGrid();

  genreButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      genreButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentGenre = btn.dataset.genre;
      sectionTitle.textContent = btn.textContent;
      renderGrid();
    });
  });

  if (window.gsap) {
    gsap.from(".sidebar", { x: -16, opacity: 0, duration: 0.45, ease: "power2.out" });
    gsap.from(".content-header, .status-bar", { y: -8, opacity: 0, duration: 0.4, ease: "power2.out", delay: 0.1 });
  }

  searchBtn.addEventListener("click", doSiteSearch);
  searchInput.addEventListener("keydown", e => { if (e.key === "Enter") doSiteSearch(); });

  saveKeyBtn.addEventListener("click", () => {
    localStorage.setItem(STORAGE_KEYS.apiKey, apiKeyInput.value.trim());
    setStatus("API anahtarı kaydedildi.");
  });

  refreshBtn.addEventListener("click", refreshFromYouTube);

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
}

function setStatus(msg) {
  statusBar.textContent = msg;
}

// ---- Grid render ----
function renderGrid(list) {
  const userSongs = getUserSongs();
  let songs;

  if (list) {
    songs = list;
  } else if (currentGenre === "benim") {
    songs = userSongs;
  } else if (currentGenre === "hepsi") {
    songs = [...userSongs, ...allSongs];
  } else {
    songs = [...userSongs, ...allSongs].filter(s => s.genre === currentGenre);
  }

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
      <a href="player.html?v=${encodeURIComponent(song.id)}&t=${encodeURIComponent(song.title)}&c=${encodeURIComponent(song.channel || "")}">
        <img src="${thumb}" alt="${escapeHtml(song.title)}" loading="lazy">
        <div class="song-card-info">
          <p class="song-card-title">${escapeHtml(song.title)}</p>
          <p class="song-card-channel">${escapeHtml(song.channel || "")}</p>
        </div>
      </a>
    `;
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
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
          title: v.snippet.title,
          channel: v.snippet.channelTitle,
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
    addResults.innerHTML = `<p style="color:var(--text-dim); font-size:13px;">Arama yapmak için önce sol alttan YouTube API anahtarını kaydet.</p>`;
    return;
  }

  addResults.innerHTML = `<p style="color:var(--text-dim); font-size:13px;">Aranıyor...</p>`;

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
      addResults.innerHTML = `<p style="color:var(--text-dim); font-size:13px;">Sonuç bulunamadı.</p>`;
      return;
    }

    addResults.innerHTML = "";
    items.forEach(v => {
      const id = v.id.videoId;
      const title = v.snippet.title;
      const channel = v.snippet.channelTitle;
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
    addResults.innerHTML = `<p style="color:var(--text-dim); font-size:13px;">Hata: ${escapeHtml(err.message)}</p>`;
  }
}

init();
