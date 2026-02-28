import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { setupIpcHandlers } from "./ipc";

const shouldOpenDevTools = process.env.REVAMP_OPEN_DEVTOOLS === "1";
const shouldSuppressChromiumLogs = process.env.REVAMP_SUPPRESS_CHROMIUM_LOGS !== "0";
const shouldDisableWgcCapture = process.env.REVAMP_DISABLE_WGC_CAPTURE !== "0";

if (shouldSuppressChromiumLogs) {
  app.commandLine.appendSwitch("log-level", "3");
}

if (process.platform === "win32" && shouldDisableWgcCapture) {
  app.commandLine.appendSwitch("disable-features", "AllowWgcWindowCapturer,AllowWgcScreenCapturer,AllowWgcZeroHz");
}

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): BrowserWindow {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  const isDev = Boolean(devServerUrl);

  const window = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1100,
    minHeight: 740,
    title: "Revamp Studio",
    backgroundColor: "#07090d",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Renderer runs on localhost in dev; allow loading local media files into <video>.
      webSecurity: !isDev
    }
  });

  if (devServerUrl) {
    window.loadURL(devServerUrl);
    if (shouldOpenDevTools) {
      window.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return window;
}

app.whenReady().then(() => {
  mainWindow = createMainWindow();
  setupIpcHandlers(() => mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
