let ytApiPromise = null;

function loadYouTubeAPI() {
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
  });

  return ytApiPromise;
}

// Altyazıyı her zaman kapalı, kaliteyi her zaman 1080p tut.
// YouTube oynatıcı bu ayarları video başlarken, tamponlarken ve altyazı
// modülü yüklenirken sıfırlayabildiği için birkaç olayda tekrar uygulanır.
const YT_QUALITY = "hd1080";

function lockPlayerSettings(player) {
  if (!player) return;
  try { if (player.unloadModule) { player.unloadModule("captions"); player.unloadModule("cc"); } } catch (_) { /* modül yoksa sorun değil */ }
  try { if (player.setPlaybackQualityRange) player.setPlaybackQualityRange(YT_QUALITY, YT_QUALITY); } catch (_) { /* desteklenmiyorsa geç */ }
  try { if (player.setPlaybackQuality) player.setPlaybackQuality(YT_QUALITY); } catch (_) { /* desteklenmiyorsa geç */ }
}

function createYtPlayer(containerId, videoId, { onReady, onStateChange, onError } = {}) {
  return new Promise((resolve) => {
    loadYouTubeAPI().then((YT) => {
      const player = new YT.Player(containerId, {
        height: "100%",
        width: "100%",
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,             // İlgili videoları gizle
          iv_load_policy: 3,  // Video içi ek açıklamaları (anotasyonları) kapat
          fs: 0,              // Tam ekran butonunu gizle
          cc_load_policy: 0,  // Altyazıyı otomatik açma
          vq: YT_QUALITY,     // Başlangıç kalitesi 1080p
          playsinline: 1,
        },
        events: {
          onReady: (e) => {
            lockPlayerSettings(e.target);
            if (onReady) onReady(e);
            resolve(player);
          },
          onStateChange: (e) => {
            // Oynatma, tamponlama ve video değişimi anlarında ayar sıfırlanabilir.
            if (e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.BUFFERING || e.data === YT.PlayerState.CUED) {
              lockPlayerSettings(e.target);
            }
            if (onStateChange) onStateChange(e);
          },
          // Altyazı modülü sonradan yüklenirse hemen kapat.
          onApiChange: (e) => {
            try { e.target.unloadModule("captions"); e.target.unloadModule("cc"); } catch (_) { /* yok say */ }
          },
          onError: (e) => {
            if (onError) onError(e);
          },
        },
      });
    });
  });
}
