const { app, BrowserWindow, shell, ipcMain } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = 47831;
let server;
let mainWindow;
let spotifyExpectedState = "";
let spotifyCallbackForwarded = false;
const mime = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8", ".webmanifest":"application/manifest+json", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".ico":"image/x-icon", ".woff2":"font/woff2", ".txt":"text/plain; charset=utf-8" };
const siteRoot = () => app.isPackaged ? path.join(process.resourcesPath, "site") : __dirname;

function startLocalServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${PORT}`).pathname); }
      catch { res.writeHead(400).end("Bad request"); return; }
      if (pathname === "/") pathname = "/index.html";
      const requestUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
      const authCode = requestUrl.searchParams.get("code");
      const authState = requestUrl.searchParams.get("state");
      const fromExternalBrowser = !String(req.headers["user-agent"] || "").includes("Electron");
      if (pathname === "/index.html" && authCode && authState === spotifyExpectedState && fromExternalBrowser && !spotifyCallbackForwarded) {
        spotifyCallbackForwarded = true;
        const callbackUrl = `http://127.0.0.1:${PORT}/index.html${requestUrl.search}`;
        setImmediate(() => mainWindow?.loadURL(callbackUrl));
        res.writeHead(200, { "Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-store" });
        res.end(`<!doctype html><meta charset="utf-8"><title>Çınla</title><body style="margin:0;background:#080808;color:#eee;font:16px system-ui;display:grid;place-items:center;height:100vh"><p>Spotify bağlandı. Çınla uygulamasına dönebilirsin.</p></body>`);
        return;
      }
      const root = siteRoot();
      const file = path.resolve(root, `.${pathname}`);
      if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end("Forbidden"); return; }
      fs.readFile(file, (error, data) => {
        if (error) { res.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found"); return; }
        res.writeHead(200, { "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream", "X-Content-Type-Options":"nosniff", "Cache-Control":"no-cache" });
        res.end(data);
      });
    });
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve());
  });
}

function syncFullscreen(url) {
  if (!mainWindow || !url.startsWith(`http://127.0.0.1:${PORT}/`)) return;
  const wantsFullscreen = new URL(url).pathname.endsWith("/player.html");
  if (mainWindow.isFullScreen() !== wantsFullscreen) mainWindow.setFullScreen(wantsFullscreen);
}

async function createWindow() {
  await startLocalServer();
  mainWindow = new BrowserWindow({ width:1440, height:940, minWidth:860, minHeight:620, backgroundColor:"#080808", autoHideMenuBar:true, title:"Çınla", webPreferences:{ preload:path.join(__dirname,"preload.cjs"), contextIsolation:true, nodeIntegration:false, sandbox:true } });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(open\.spotify\.com|accounts\.spotify\.com|www\.youtube\.com|youtube\.com)\//i.test(url)) shell.openExternal(url);
    else shell.openExternal(url);
    return { action:"deny" };
  });
  mainWindow.webContents.on("will-navigate", (_event, url) => syncFullscreen(url));
  mainWindow.webContents.on("did-navigate", (_event, url) => syncFullscreen(url));
  mainWindow.on("closed", () => { mainWindow = null; });
  await mainWindow.loadURL(`http://127.0.0.1:${PORT}/index.html`);
}

ipcMain.on("spotify-auth:open", (_event, rawUrl) => {
  try {
    const url = new URL(rawUrl);
    const expectedRedirect = `http://127.0.0.1:${PORT}/index.html`;
    if (url.origin !== "https://accounts.spotify.com" || url.pathname !== "/authorize" || url.searchParams.get("redirect_uri") !== expectedRedirect) return;
    spotifyExpectedState = url.searchParams.get("state") || "";
    spotifyCallbackForwarded = false;
    shell.openExternal(url.toString());
  } catch { /* reject invalid auth URL */ }
});

app.whenReady().then(createWindow).catch(error => { console.error(error); app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { if (server) server.close(); });
