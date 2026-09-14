// Basit YouTube IFrame Player API yükleyici / sarmalayıcı.
// Kullanım: loadYouTubeAPI().then(() => createYtPlayer(containerId, videoId, callbacks))

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

function createYtPlayer(containerId, videoId, { onReady, onStateChange } = {}) {
  return new Promise((resolve) => {
    loadYouTubeAPI().then((YT) => {
      const player = new YT.Player(containerId, {
        height: "1",
        width: "1",
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: (e) => {
            if (onReady) onReady(e);
            resolve(player);
          },
          onStateChange: (e) => {
            if (onStateChange) onStateChange(e);
          },
        },
      });
    });
  });
}
