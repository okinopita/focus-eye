/**
 * Electron Main Process
 * Handles IPC communication for session management and app logging.
 */
import { app, BrowserWindow, ipcMain, shell, Tray, nativeImage, Notification } from "electron";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { systemUtils, setUseAutomation } from "../native/getForegroundApp.js";
import { categorizeApp, calculateUsageSummary, applyAIClassificationToLogs, applyTaskRelevanceScores, calculateTaskRelevanceMetrics } from "../common/analytics.js";
import { classifyOtherAppsWithAI } from "../ai/client.js";
import { initializeDatabase, closeDatabase } from "../db/database.js";
import { SessionRepository, SettingsRepository, GoalRepository } from "../db/repositories.js";
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
let tray: Tray | null = null;
let trayAnimationInterval: NodeJS.Timeout | null = null;
let isEyeOpen = true;

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

/**
 * Create system tray icon with blinking animation
 * Using macOS SFSymbols for licensing safety
 */
function createTrayIcon() {
  // SF Symbols "eyes" - no licensing concerns, Apple-provided
  const eyeOpenIcon = nativeImage.createFromNamedImage("eyes", [16, 16]);
  tray = new Tray(eyeOpenIcon);
  tray.setToolTip("Focus Eye - セッション実行中");
  console.log("[Tray] Created tray icon with SF Symbol 'eyes'");
}

/**
 * Start tray icon blinking animation
 */
function startTrayAnimation() {
  if (trayAnimationInterval) return;
  
  // SF Symbols for blinking animation
  const eyeOpenIcon = nativeImage.createFromNamedImage("eyes", [16, 16]);
  const eyeClosedIcon = nativeImage.createFromNamedImage("eyes.closed", [16, 16]);

  console.log("[Tray] Starting eye animation with SF Symbols");
  
  // Blinking pattern: open (2s) → closed (100ms) → repeat
  trayAnimationInterval = setInterval(() => {
    if (!tray) return;
    
    if (isEyeOpen) {
      // Blink: close eyes briefly
      tray.setImage(eyeClosedIcon);
      isEyeOpen = false;
      
      // Reopen after 100ms
      setTimeout(() => {
        if (tray && !isEyeOpen) {
          tray.setImage(eyeOpenIcon);
          isEyeOpen = true;
        }
      }, 100);
    }
  }, 2000); // Blink every 2 seconds
}

/**
 * Stop tray icon animation and remove tray
 */
function stopTrayAnimation() {
  console.log("[Tray] Stopping eye animation");
  
  if (trayAnimationInterval) {
    clearInterval(trayAnimationInterval);
    trayAnimationInterval = null;
  }
  
  if (tray) {
    tray.destroy();
    tray = null;
  }
  
  isEyeOpen = true;
}

/**
 * Show session completion notification
 */
function showSessionNotification(result: SessionResult, goalTitle?: string) {
  const duration = Math.round(result.durationMs / 1000 / 60); // Convert to minutes
  const focusScore = result.taskRelevanceScore ? Math.round(result.taskRelevanceScore * 100) : 0;
  
  const notification = new Notification({
    title: "✅ セッション完了",
    body: `${goalTitle || "セッション"}が完了しました！\n⏱️ ${duration}分 | 📊 集中度 ${focusScore}%`,
    icon: nativeImage.createFromNamedImage("eyes", [64, 64]),
    urgency: "normal",
    silent: false,
  });

  notification.show();

  // Click notification to bring window to front
  notification.on("click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  console.log("[Notification] Session completion notification shown");
}

app.on("ready", async () => {
  await initializeDatabase();
  createWindow();
});
app.on("window-all-closed", () => {
  closeDatabase();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
app.on("before-quit", () => {
  closeDatabase();
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
    console.log(`[IPC] Starting session: ${req.sessionTimeMs}ms, automation=${req.enableAutomation}, goalId=${req.goalId}`);

    // Start tray icon animation
    createTrayIcon();
    startTrayAnimation();

    // If goalId is provided, get goal title and use it as taskTitle
    let taskTitle = req.taskTitle || "Untitled";
    if (req.goalId) {
      const goalRepo = new GoalRepository();
      const goal = goalRepo.findById(req.goalId);
      if (goal) {
        taskTitle = goal.title;
        console.log(`[IPC] Using goal title as task title: "${taskTitle}"`);
      }
    }

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
    const logsWithBrowsing = appLogs.filter(log => log.browsing);
    console.log(`[IPC] Logs with browsing field: ${logsWithBrowsing.length}`);
    if (logsWithBrowsing.length > 0) {
      console.log("[IPC] Sample browsing data:", logsWithBrowsing.slice(0, 3));
    }
    
    const { appSummary, categorySummary } = calculateUsageSummary(appLogs);

    // Call AI classification for OTHER/BROWSER apps (blocking to ensure scores are calculated)
    console.log("[IPC] Classifying OTHER/BROWSER apps with AI...");
    try {
      // Determine which categories to include based on browser automation
      const categoriesToFilter = req.enableAutomation 
        ? ["OTHER", "BROWSER"]  // Include BROWSER only when automation enabled
        : ["OTHER"];              // Only OTHER when automation disabled

      console.log(`[IPC] Browser automation: ${req.enableAutomation}, filtering categories:`, categoriesToFilter);

      // Extract apps that were classified as OTHER or BROWSER
      const otherApps = appLogs
        .filter((log) => categoriesToFilter.includes(log.category))
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

      let finalLogs = appLogs;
      let finalCategorySummary = categorySummary;

      if (otherApps.length > 0) {
        console.log(`[IPC] Calling AI with ${otherApps.length} OTHER/BROWSER apps`);
        console.log(`[IPC] Task title for AI: "${taskTitle}"`);
        console.log(`[IPC] Browser mode: ${req.enableAutomation}`);
        console.log(`[IPC] otherApps details:`, JSON.stringify(otherApps, null, 2));
        const aiResult = await classifyOtherAppsWithAI(otherApps, taskTitle, req.enableAutomation);
        if (aiResult) {
          console.log("[IPC] AI classification received:", aiResult);
          // Apply AI classification and scores to logs
          finalLogs = applyAIClassificationToLogs(appLogs, aiResult) as AppLog[];
          const { categorySummary: newCategorySummary } = calculateUsageSummary(finalLogs);
          finalCategorySummary = newCategorySummary;
          console.log("[IPC] Updated category summary:", newCategorySummary);
        }
      } else {
        console.log("[IPC] No OTHER apps to classify");
      }

      // Apply task relevance scores to all logs (including non-OTHER categories)
      const logsWithScores = applyTaskRelevanceScores(finalLogs);
      console.log("[IPC] Sample logs with scores:", logsWithScores.slice(0, 3));

      // Calculate task relevance metrics
      const taskMetrics = calculateTaskRelevanceMetrics(logsWithScores);
      console.log("[IPC] Task relevance metrics:", taskMetrics);

      // Save session to database
      const sessionRepo = new SessionRepository();

      const savedSession = sessionRepo.create({
        goal_id: req.goalId || null,
        task_title: taskTitle,
        task_intent: req.taskIntent || null,
        start_time: sessionStartTime,
        end_time: sessionEndTime,
        duration_ms: sessionEndTime - sessionStartTime,
        work_ms: finalCategorySummary.WORK || 0,
        communication_ms: finalCategorySummary.COMMUNICATION || 0,
        game_ms: finalCategorySummary.GAME || 0,
        entertainment_ms: finalCategorySummary.ENTERTAINMENT || 0,
        browser_ms: finalCategorySummary.BROWSER || 0,
        other_ms: finalCategorySummary.OTHER || 0,
        task_relevance_score: taskMetrics.taskRelevanceScore,
        task_relevant_time_ms: taskMetrics.taskRelevantTimeMs,
        task_irrelevant_time_ms: taskMetrics.taskIrrelevantTimeMs,
        browser_automation_enabled: req.enableAutomation || false,
        is_demo: false,
      });

      console.log("[IPC] Session saved to DB with ID:", savedSession.id);

      const result: SessionResult = {
        startTime: sessionStartTime,
        endTime: sessionEndTime,
        durationMs: sessionEndTime - sessionStartTime,
        appLogs: logsWithScores,
        usageSummary: appSummary,
        categoryUsageSummary: finalCategorySummary,
        taskRelevanceScore: taskMetrics.taskRelevanceScore,
        taskRelevantTimeMs: taskMetrics.taskRelevantTimeMs,
        taskIrrelevantTimeMs: taskMetrics.taskIrrelevantTimeMs,
      };

      console.log("[IPC] Session completed:", result);
      
      // Stop tray icon animation and show notification
      stopTrayAnimation();
      showSessionNotification(result, taskTitle);
      
      return { success: true, result };
    } catch (e) {
      console.error("[IPC] AI classification failed:", e);
      
      // Return result without AI classification
      const result: SessionResult = {
        startTime: sessionStartTime,
        endTime: sessionEndTime,
        durationMs: sessionEndTime - sessionStartTime,
        appLogs,
        usageSummary: appSummary,
        categoryUsageSummary: categorySummary,
      };
      
      // Stop tray icon animation on error path too
      stopTrayAnimation();
      
      // Show notification even if AI failed
      showSessionNotification(result, taskTitle);
      
      return { success: true, result };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[IPC] Session error:", errorMsg);
    
    // Stop tray icon animation on error
    stopTrayAnimation();
    
    return { success: false, error: errorMsg };
  }
});

/**
 * IPC Handler: Get active goals
 */
ipcMain.handle("goals:getActive", async (): Promise<{ success: boolean; goals?: any[]; error?: string }> => {
  try {
    console.log("[IPC] Getting active goals...");
    const goalRepo = new GoalRepository();
    const goals = goalRepo.findActive();
    console.log("[IPC] Found goals:", goals);
    return { success: true, goals };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[IPC] Get active goals error:", errorMsg);
    return { success: false, error: errorMsg };
  }
});

/**
 * IPC Handler: Create a new goal
 */
ipcMain.handle("goals:create", async (event, goalData: any): Promise<{ success: boolean; goal?: any; error?: string }> => {
  try {
    console.log("[IPC] ============ Creating goal ============");
    console.log("[IPC] Received goalData:", goalData);
    console.log("[IPC] goalData type:", typeof goalData);
    console.log("[IPC] goalData keys:", Object.keys(goalData || {}));
    
    const goalRepo = new GoalRepository();
    console.log("[IPC] GoalRepository instantiated");
    
    const goal = goalRepo.create(goalData);
    console.log("[IPC] Goal created successfully:", goal);
    console.log("[IPC] =====================================");
    
    return { success: true, goal };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : "";
    console.error("[IPC] ============ Create goal ERROR ============");
    console.error("[IPC] Error message:", errorMsg);
    console.error("[IPC] Error stack:", errorStack);
    console.error("[IPC] ==========================================");
    return { success: false, error: errorMsg };
  }
});

/**
 * IPC Handler: Get all goals (including inactive)
 */
ipcMain.handle("goals:getAll", async (): Promise<{ success: boolean; goals?: any[]; error?: string }> => {
  try {
    console.log("[IPC] Getting all goals (including inactive)...");
    const goalRepo = new GoalRepository();
    const goals = goalRepo.findAll();
    console.log(`[IPC] Found ${goals.length} goals:`, goals);
    return { success: true, goals };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[IPC] Get all goals error:", errorMsg);
    return { success: false, error: errorMsg };
  }
});

/**
 * IPC Handler: Get total session time for a specific goal
 */
ipcMain.handle("sessions:getTotalTimeByGoal", async (event, goalId: number): Promise<{ success: boolean; totalTime?: number; error?: string }> => {
  try {
    console.log(`[IPC] Getting total session time for goal ${goalId}...`);
    const sessionRepo = new SessionRepository();
    const totalTime = sessionRepo.getTotalTimeByGoal(goalId);
    console.log(`[IPC] Total time for goal ${goalId}: ${totalTime}ms`);
    return { success: true, totalTime };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[IPC] Get total time by goal error:", errorMsg);
    return { success: false, error: errorMsg };
  }
});

/**
 * IPC Handler: Open URL in default browser
 */
ipcMain.handle("shell:openExternal", async (event, url: string): Promise<{ success: boolean; error?: string }> => {
  try {
    console.log(`[IPC] Opening URL in default browser: ${url}`);
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[IPC] Open external error:", errorMsg);
    return { success: false, error: errorMsg };
  }
});
