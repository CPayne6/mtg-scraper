import { app, BrowserWindow, shell } from "electron";
import serve from "electron-serve";
import path, { join } from "path";
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appServe = app.isPackaged ? serve({
  directory: join(__dirname, "../out")
}) : null;

console.log(join(__dirname, "preload.js"))

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: join(__dirname, "preload.js")
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Add logic here to determine if the URL should be opened externally
    // For example, check if the host is different from your app's host
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' }
    }
    return { action: 'allow' }
  });

  if (app.isPackaged) {
    appServe(win).then(() => {
      win.loadURL("app://-");
    });
  } else {
    win.loadURL("http://localhost:3000");
    win.webContents.openDevTools();
    win.webContents.on("did-fail-load", (e, code, desc) => {
      win.webContents.reloadIgnoringCache();
    });
  }
}

app.on("ready", () => {
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});