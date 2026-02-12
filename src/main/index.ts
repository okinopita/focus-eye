/**
 * Electron メインプロセス
 * セッション管理とアプリケーションロギング用の IPC 通信を処理
 */
import { app, BrowserWindow, ipcMain, shell, Tray, nativeImage } from "electron";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { systemUtils, setUseAutomation } from "../native/getForegroundApp.js";
import { categorizeApp, calculateUsageSummary, applyAIClassificationToLogs, applyTaskRelevanceScores, calculateTaskRelevanceMetrics } from "../common/analytics.js";
import { classifyOtherAppsWithAI } from "../ai/client.js";
import { initializeDatabase, closeDatabase, getDatabase } from "../db/database.js";
import { SessionRepository, SettingsRepository, GoalRepository } from "../db/repositories.js";
import type { IpcSessionRequest, IpcSessionResponse, AppLog, SessionResult } from "../common/types.js";

// AWS認証情報のため .env ファイルをロード
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
    console.log("[Main] .env ファイル読み込み完了");
  }
}

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayAnimationInterval: NodeJS.Timeout | null = null;
let isEyeOpen = true;
let isSessionRunning = false; // セッション実行中フラグ

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
 * システムトレイアイコンを作成（まばたきアニメーション付き）
 * macOS SF Symbols を使用（ライセンス安全）
 */
function createTrayIcon() {
  // SF Symbols "eyes" - Apple提供
  const eyeOpenIcon = nativeImage.createFromNamedImage("eyes", [16, 16]);
  tray = new Tray(eyeOpenIcon);
  tray.setToolTip("Focus Eye - セッション実行中");
  console.log("[Tray] SF Symbol 'eyes' でトレイアイコン作成完了");
}

/**
 * トレイアイコンアニメーションを開始
 */
function startTrayAnimation() {
  if (trayAnimationInterval) return;
  
  // SF Symbols まばたきアニメーション用
  const eyeOpenIcon = nativeImage.createFromNamedImage("eyes", [16, 16]);
  const eyeClosedIcon = nativeImage.createFromNamedImage("eyes.closed", [16, 16]);

  console.log("[Tray] SF Symbols で目のアニメーション開始");
  
  // まばたきパターン: 開く (2s) → 閉じる (100ms) → 繰り返し
  trayAnimationInterval = setInterval(() => {
    if (!tray) return;
    
    if (isEyeOpen) {
      // まばたき: 目を一時的に閉じる
      tray.setImage(eyeClosedIcon);
      isEyeOpen = false;
      
      // 100ms後に再度開く
      setTimeout(() => {
        if (tray && !isEyeOpen) {
          tray.setImage(eyeOpenIcon);
          isEyeOpen = true;
        }
      }, 100);
    }
  }, 2000); // 2秒ごとにまばたき
}

/**
 * トレイアイコンアニメーションを停止してトレイを削除
 */
function stopTrayAnimation() {
  console.log("[Tray] 目のアニメーション停止");
  
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
 * セッション完了通知を表示（AppleScript 使用）
 */
function showSessionNotification(result: SessionResult, goalTitle?: string) {
  const duration = Math.round(result.durationMs / 1000 / 60); // 分に変換
  const focusScore = result.taskRelevanceScore ? Math.round(result.taskRelevanceScore * 100) : 0;
  
  const title = "セッション完了";
  const subtitle = goalTitle || "セッション";
  const message = `${duration}分作業 | 集中度 ${focusScore}%`;
  
  // macOS のみ通知を表示
  if (process.platform !== "darwin") {
    console.log("[Notification] macOS 以外のプラットフォームでは通知非対応");
    return;
  }
  
  try {
    // AppleScript で確実に通知を表示
    const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}" subtitle "${subtitle.replace(/"/g, '\\"')}" sound name "Glass"`;
    execSync(`osascript -e '${script}'`);
    
    console.log("[Notification] セッション完了通知を表示: " + goalTitle);
  } catch (error) {
    console.error("[Notification] 通知表示エラー:", error);
  }
}

app.on("ready", async () => {
  // 起動時に既存DBをロード（既存データは保持される）
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
 * IPC ハンドラ: データベースを初期化
 */
ipcMain.handle("init:database", async (): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    console.log("[IPC] DB初期化リクエスト受信");
    await initializeDatabase();
    console.log("[IPC] DB初期化成功");
    return { success: true, message: "Database initialized successfully" };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[IPC] DB初期化エラー:", errorMsg);
    return { success: false, error: errorMsg };
  }
});

/**
 * IPC ハンドラ: セッションを開始してアプリケーションログを収集
 */
ipcMain.handle("session:start", async (event, req: IpcSessionRequest): Promise<IpcSessionResponse> => {
  try {
    if (!systemUtils) {
      return { success: false, error: "systemUtils not available (unsupported platform)" };
    }

    // DBが初期化されているか確認
    try {
      getDatabase();
    } catch {
      return { success: false, error: "Database not initialized. Please initialize the database first by calling init:database" };
    }

    setUseAutomation(req.enableAutomation ?? false);
    console.log(`[IPC] Starting session: ${req.sessionTimeMs}ms, automation=${req.enableAutomation}, goalId=${req.goalId}`);

    // セッション実行中フラグをオン
    isSessionRunning = true;

    // トレイアイコンアニメーション開始
    createTrayIcon();
    startTrayAnimation();

    // goalIdが指定されている場合、ゴールタイトルを取得して taskTitle として使用
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

    // セッション中のアプリケーションログを収集
    while (isSessionRunning && Date.now() - sessionStartTime < req.sessionTimeMs) {
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

      // 次のチェックまで待機
      await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
    }

    const sessionEndTime = Date.now();
    console.log(`[IPC] セッション中に ${appLogs.length} 件のアプリログを収集`);
    console.log("[IPC] サンプルログ:", appLogs.slice(0, 3));
    const logsWithBrowsing = appLogs.filter(log => log.browsing);
    console.log(`[IPC] browsing フィールドありのログ: ${logsWithBrowsing.length}`);
    if (logsWithBrowsing.length > 0) {
      console.log("[IPC] ブラウジングデータサンプル:", logsWithBrowsing.slice(0, 3));
    }
    
    const { appSummary, categorySummary } = calculateUsageSummary(appLogs);

    // OTHER/BROWSERアプリのAI分類を呼び出し（スコア計算を確保するためブロッキング）
    console.log("[IPC] OTHER/BROWSER アプリを AI で分類中...");
    try {
      // ブラウザ自動化に基づいて含めるカテゴリを決定
      const categoriesToFilter = req.enableAutomation 
        ? ["OTHER", "BROWSER"]  // 自動化有効時のみBROWSERを含める
        : ["OTHER"];              // 自動化無効時はOTHERのみ

      console.log(`[IPC] Browser automation: ${req.enableAutomation}, filtering categories:`, categoriesToFilter);

      // OTHER または BROWSER に分類されたアプリを抽出
      const otherApps = appLogs
        .filter((log) => categoriesToFilter.includes(log.category))
        .reduce(
          (acc, log) => {
            const existing = acc.find((a) => a.app_name === log.appDisplayName);
            if (existing) {
              // ウィンドウタイトルを収集
              if (log.browsing) {
                existing.window_titles_sample.push(log.browsing);
              }
            } else {
              acc.push({
                app_name: log.appDisplayName,
                seconds: 0, // 後で計算される
                window_titles_sample: log.browsing ? [log.browsing] : [],
              });
            }
            return acc;
          },
          [] as Array<{ app_name: string; seconds: number; window_titles_sample: string[] }>
        );

      // appSummary の時間データを追加
      otherApps.forEach((app) => {
        app.seconds = (appSummary[app.app_name] ?? 0) / 1000; // ミリ秒から秒に変換
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
          console.log("[IPC] AI 分類結果を受信:", aiResult);
          // AI分類とスコアをログに適用
          finalLogs = applyAIClassificationToLogs(appLogs, aiResult) as AppLog[];
          const { categorySummary: newCategorySummary } = calculateUsageSummary(finalLogs);
          finalCategorySummary = newCategorySummary;
          console.log("[IPC] カテゴリサマリ更新:", newCategorySummary);
        }
      } else {
        console.log("[IPC] 分類すべき OTHER アプリなし");
      }

      // 全ログにタスク関連スコアを適用（OTHER以外のカテゴリを含む）
      const logsWithScores = applyTaskRelevanceScores(finalLogs);
      console.log("[IPC] スコア付きログサンプル:", logsWithScores.slice(0, 3));

      // タスク関連性メトリクスを計算
      const taskMetrics = calculateTaskRelevanceMetrics(logsWithScores);
      console.log("[IPC] タスク関連性メトリクス:", taskMetrics);

      // セッションをデータベースに保存
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

      console.log("[IPC] セッションを DB に保存完了 ID:", savedSession.id);

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

      console.log("[IPC] セッション完了:", result);
      
      // セッション実行中フラグをオフ
      isSessionRunning = false;
      
      // トレイアイコンアニメーション停止と通知表示
      stopTrayAnimation();
      showSessionNotification(result, taskTitle);
      
      return { success: true, result };
    } catch (e) {
      console.error("[IPC] AI classification failed:", e);
      
      // AI分類なしで結果を返す
      const result: SessionResult = {
        startTime: sessionStartTime,
        endTime: sessionEndTime,
        durationMs: sessionEndTime - sessionStartTime,
        appLogs,
        usageSummary: appSummary,
        categoryUsageSummary: categorySummary,
      };
      
      // エラーパスでもトレイアイコンアニメーション停止
      stopTrayAnimation();
      
      // セッション実行中フラグをオフ
      isSessionRunning = false;
      
      // AI失敗時も通知を表示
      showSessionNotification(result, taskTitle);
      
      return { success: true, result };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[IPC] Session error:", errorMsg);
    
    // Stop tray icon animation on error
    stopTrayAnimation();
    
    // セッション実行中フラグをオフ
    isSessionRunning = false;
    
    return { success: false, error: errorMsg };
  }
});

/**
 * IPC ハンドラ: セッションを中断
 */
ipcMain.handle("session:stop", async (): Promise<{ success: boolean; message?: string }> => {
  try {
    if (!isSessionRunning) {
      return { success: false, message: "No session is currently running" };
    }
    
    console.log("[IPC] セッション中断リクエスト受信");
    isSessionRunning = false;
    
    // Stop tray icon animation
    stopTrayAnimation();
    
    return { success: true, message: "Session interrupted" };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[IPC] Session stop error:", errorMsg);
    return { success: false, message: errorMsg };
  }
});

/**
 * IPC ハンドラ: 有効なゴールを取得
 */
ipcMain.handle("goals:getActive", async (): Promise<{ success: boolean; goals?: any[]; error?: string }> => {
  try {
    console.log("[IPC] アクティブなゴールを取得中...");
    const goalRepo = new GoalRepository();
    const goals = goalRepo.findActive();
    console.log("[IPC] 見つかったゴール:", goals);
    return { success: true, goals };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[IPC] Get active goals error:", errorMsg);
    return { success: false, error: errorMsg };
  }
});

/**
 * IPC ハンドラ: 新しいゴールを作成
 */
ipcMain.handle("goals:create", async (event, goalData: any): Promise<{ success: boolean; goal?: any; error?: string }> => {
  try {
    console.log("[IPC] ============ ゴール作成中 ============");
    console.log("[IPC] 受信した goalData:", goalData);
    console.log("[IPC] goalData 型:", typeof goalData);
    console.log("[IPC] goalData キー:", Object.keys(goalData || {}));
    
    const goalRepo = new GoalRepository();
    console.log("[IPC] GoalRepository インスタンス化完了");
    
    const goal = goalRepo.create(goalData);
    console.log("[IPC] ゴール作成成功:", goal);
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
 * IPC ハンドラ: 全ゴールを取得（無効なものを含む）
 */
ipcMain.handle("goals:getAll", async (): Promise<{ success: boolean; goals?: any[]; error?: string }> => {
  try {
    console.log("[IPC] 全ゴールを取得中 (非アクティブも含む)...");
    const goalRepo = new GoalRepository();
    const goals = goalRepo.findAll();
    console.log(`[IPC] ${goals.length} 件のゴールを発見:`);
    return { success: true, goals };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[IPC] Get all goals error:", errorMsg);
    return { success: false, error: errorMsg };
  }
});

/**
 * IPC ハンドラ: 特定のゴールの総セッション時間を取得
 */
ipcMain.handle("sessions:getTotalTimeByGoal", async (event, goalId: number): Promise<{ success: boolean; totalTime?: number; error?: string }> => {
  try {
    console.log(`[IPC] ゴール ${goalId} の総セッション時間を取得中...`);
    const sessionRepo = new SessionRepository();
    const totalTime = sessionRepo.getTotalTimeByGoal(goalId);
    console.log(`[IPC] ゴール ${goalId} の総時間: ${totalTime}ms`);
    return { success: true, totalTime };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[IPC] Get total time by goal error:", errorMsg);
    return { success: false, error: errorMsg };
  }
});

/**
 * IPC ハンドラ: URL をでフォルトブラウザで開く
 */
ipcMain.handle("shell:openExternal", async (event, url: string): Promise<{ success: boolean; error?: string }> => {
  try {
    console.log(`[IPC] デフォルトブラウザで URL を開く: ${url}`);
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[IPC] Open external error:", errorMsg);
    return { success: false, error: errorMsg };
  }
});
