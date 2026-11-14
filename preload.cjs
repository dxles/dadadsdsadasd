const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("cinlaDesktop", Object.freeze({
  isDesktop:true,
  platform:process.platform,
  openSpotifyAuth:(url) => ipcRenderer.send("spotify-auth:open", String(url)),
}));
