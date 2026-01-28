/**
 * Electron Main Process
 * Handles IPC communication for session management and app logging.
 */
import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { systemUtils, setUseAutomation } from "../native/getForegroundApp.js";
import { categorizeApp, calculateUsageSummary, applyAIClassificationToLogs } from "../common/analytics.js";
import { classifyOtherAppsWithAI } from "../ai/client.js";
import type { IpcSessionRequest, IpcSessionResponse, AppLog, SessionResult } from "../common/types.js";

// Load .env file for AWS credentials
function loadEnv() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const envPath = path.join(__dirname, "..", "..", ".env");
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, value] = trimmed.split("=");
        if (key && value) {
          process.env[key.trim()] = value.trim();
        }
      }
    });
    console.log("[Main] .env file loaded");
  }
}

loadEnv();

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

    // Call AI classification for OTHER apps (async, non-blocking)
    console.log("[IPC] Classifying OTHER apps with AI...");
    (async () => {
      try {
        // Extract apps that were classified as OTHER
        const otherApps = appLogs
          .filter((log) => log.category === "OTHER")
          .reduce(
            (acc, log) => {
              const existing = acc.find((a) => a.app_name === log.appDisplayName);
              if (existing) {
                // Collect window titles
                if (log.browsing) {
                  existing.window_titles_sample.push(log.browsing);
                }
              } else {
                acc.push({
                  app_name: log.appDisplayName,
                  seconds: 0, // Will be calculated later
                  window_titles_sample: log.browsing ? [log.browsing] : [],
                });
              }
              return acc;
            },
            [] as Array<{ app_name: string; seconds: number; window_titles_sample: string[] }>
          );

        // Add time data from appSummary
        otherApps.forEach((app) => {
          app.seconds = (appSummary[app.app_name] ?? 0) / 1000; // Convert ms to seconds
        });

        if (otherApps.length > 0) {
          const aiResult = await classifyOtherAppsWithAI(otherApps);
          if (aiResult) {
            console.log("[IPC] AI classification received:", aiResult);
            // Apply AI classification to logs
            const reclassifiedLogs = applyAIClassificationToLogs(appLogs, aiResult);
            const { appSummary: newAppSummary, categorySummary: newCategorySummary } = calculateUsageSummary(
              reclassifiedLogs as AppLog[]
            );
            console.log("[IPC] Updated category summary:", newCategorySummary);
          }
        } else {
          console.log("[IPC] No OTHER apps to classify");
        }
      } catch (e) {
        console.error("[IPC] AI classification failed:", e);
      }
    })();

    console.log("[IPC] Session completed:", result);
    return { success: true, result };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[IPC] Session error:", errorMsg);
    return { success: false, error: errorMsg };
  }
});
