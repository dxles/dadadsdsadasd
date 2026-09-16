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
          fs: 0,              // Tam ekran butonunu gizle (isteğe bağlı temiz görünüm)
        },
        events: {
          onReady: (e) => {
            if (onReady) onReady(e);
            resolve(player);
          },
          onStateChange: (e) => {
            if (onStateChange) onStateChange(e);
          },
          onError: (e) => {
            if (onError) onError(e);
          },
        },
      });
    });
  });
}