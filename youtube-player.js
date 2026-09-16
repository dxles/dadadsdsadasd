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
      
      // Container'ı iframe'e dönüştürüp özel CSP ve katı izin politikaları ekliyoruz
      const container = document.getElementById(containerId);
      if (container && container.tagName.toLowerCase() !== 'iframe') {
        const iframe = document.createElement('iframe');
        iframe.id = containerId;
        
        // Reklam sunucularını ve takipçi script'lerini engelleyen CSP politikası
        iframe.setAttribute('csp', "default-src 'self' https://*.youtube.com https://*.ytimg.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.youtube.com https://*.ytimg.com; img-src 'self' https://*.ytimg.com https://*.youtube.com; connect-src 'self' https://*.youtube.com; style-src 'self' 'unsafe-inline' https://*.youtube.com;");
        
        // İzin politikası: Sadece oynatmaya izin ver, reklam ve gereksiz API'leri kapat
        iframe.setAttribute('allow', 'autoplay; encrypted-media');
        iframe.setAttribute('frameborder', '0');
        container.parentNode.replaceChild(iframe, container);
      }

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
