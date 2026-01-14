/**
 * Electron Main Process
 * Handles IPC communication for session management and app logging.
 */
import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "url";
import path from "path";
import { systemUtils, setUseAutomation } from "../native/getForegroundApp.js";
import { categorizeApp, calculateUsageSummary } from "../common/analytics.js";
import type { IpcSessionRequest, IpcSessionResponse, AppLog, SessionResult } from "../common/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const isDev = process.env.NODE_ENV === "development";
  let startUrl: string;
  if (isDev) {
    startUrl = "http://localhost:5173";
  } else {
    const filePath = path.join(__dirname, "../renderer/index.html");
    startUrl = `file://${filePath}`;
  }

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("ready", createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

/**
 * IPC Handler: Start session and collect app logs
 */
ipcMain.handle("session:start", async (event, req: IpcSessionRequest): Promise<IpcSessionResponse> => {
  try {
    if (!systemUtils) {
      return { success: false, error: "systemUtils not available (unsupported platform)" };
    }

    setUseAutomation(req.enableAutomation ?? false);
    console.log(`[IPC] Starting session: ${req.sessionTimeMs}ms, automation=${req.enableAutomation}`);

    const sessionStartTime = Date.now();
    const appLogs: AppLog[] = [];
    const checkIntervalMs = 5000;

    // Collect app logs during session
    while (Date.now() - sessionStartTime < req.sessionTimeMs) {
      try {
        const fg = await systemUtils.getForegroundApp();
        if (typeof fg === "object") {
          const category = categorizeApp(fg.appDisplayName, fg.appExecutable, fg.browsing);
          appLogs.push({
            timestamp: Date.now(),
            appDisplayName: fg.appDisplayName,
            appExecutable: fg.appExecutable,
            browsing: fg.browsing,
            category,
          });
        }
      } catch (e) {
        console.error("getForegroundApp error:", e);
      }

      // Wait before next check
      await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
    }

    const sessionEndTime = Date.now();
    console.log(`[IPC] Collected ${appLogs.length} app logs during session`);
    console.log("[IPC] Sample logs:", appLogs.slice(0, 3));
    
    const { appSummary, categorySummary } = calculateUsageSummary(appLogs);

    const result: SessionResult = {
      startTime: sessionStartTime,
      endTime: sessionEndTime,
      durationMs: sessionEndTime - sessionStartTime,
      appLogs,
      usageSummary: appSummary,
      categoryUsageSummary: categorySummary,
    };

    console.log("[IPC] Session completed:", result);
    return { success: true, result };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[IPC] Session error:", errorMsg);
    return { success: false, error: errorMsg };
  }
});
