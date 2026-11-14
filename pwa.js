(() => {
  const installButton = document.getElementById("installAppBtn");
  const status = document.getElementById("statusBar");
  if (!installButton) return;

  let installPrompt = null;
  const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (isInstalled()) installButton.hidden = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
  });

  window.addEventListener("appinstalled", () => {
    installButton.hidden = true;
    installPrompt = null;
    if (status) status.textContent = "Çınla cihazına eklendi.";
  });

  installButton.addEventListener("click", async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      return;
    }

    if (!status) return;
    if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
      status.textContent = "Çınla zaten uygulama olarak açık.";
    } else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      status.textContent = "Yüklemek için Paylaş menüsünü açıp “Ana Ekrana Ekle”yi seç.";
    } else {
      status.textContent = "Yükleme seçeneği için tarayıcı menüsünde “Uygulamayı yükle” veya “Ana ekrana ekle”yi seç.";
    }
  });
})();
