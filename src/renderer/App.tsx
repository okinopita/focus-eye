/**
 * React App Component - Session UI
 */
import React, { useState, useEffect } from "react";
import type { SessionResult, IpcSessionRequest, Goal, NewGoal, AppLog } from "../common/types";
import GoalsStatsView from "./GoalsStatsView";

declare global {
  interface Window {
    electronAPI?: {
      initDatabase: () => Promise<{ success: boolean; message?: string; error?: string }>;
      startSession: (req: IpcSessionRequest) => Promise<{ success: boolean; result?: SessionResult; error?: string }>;
      stopSession: () => Promise<{ success: boolean; message?: string }>;
      getActiveGoals: () => Promise<{ success: boolean; goals?: Goal[]; error?: string }>;
      getAllGoals: () => Promise<{ success: boolean; goals?: Goal[]; error?: string }>;
      createGoal: (goalData: NewGoal) => Promise<{ success: boolean; goal?: Goal; error?: string }>;
      getTotalTimeByGoal: (goalId: number) => Promise<{ success: boolean; totalTime?: number; error?: string }>;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

export default function App() {
  const [currentTab, setCurrentTab] = useState<"session" | "goals">("session");
  const [sessionView, setSessionView] = useState<"form" | "result">("form");
  const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalTargetValue, setNewGoalTargetValue] = useState(5);
  const [newGoalTargetUnit, setNewGoalTargetUnit] = useState<"seconds" | "minutes" | "hours">("hours");
  const [newGoalDays, setNewGoalDays] = useState(7);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskIntent, setTaskIntent] = useState("");
  const [sessionDurationValue, setSessionDurationValue] = useState(1);
  const [sessionDurationUnit, setSessionDurationUnit] = useState<"seconds" | "minutes" | "hours">("minutes");
  const [enableAutomation, setEnableAutomation] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isInitializingDb, setIsInitializingDb] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // マウント時にすべてのゴールをロード（統計表示用）
  useEffect(() => {
    const loadGoals = async () => {
      if (!window.electronAPI?.getAllGoals) return;
      
      const response = await window.electronAPI.getAllGoals();
      if (response.success && response.goals) {
        setGoals(response.goals);
      }
    };
    
    loadGoals();
  }, []);

  // ヘルパー: 期間をミリ秒に変換
  const convertToMs = (value: number, unit: "seconds" | "minutes" | "hours"): number => {
    switch (unit) {
      case "seconds":
        return value * 1000;
      case "minutes":
        return value * 60 * 1000;
      case "hours":
        return value * 60 * 60 * 1000;
    }
  };

  // ツイート用テキスト生成
  const generateTweetText = (): string => {
    if (!result) return "";
    
    const focusScore = result.taskRelevanceScore 
      ? Math.round(result.taskRelevanceScore * 100) 
      : 0;
    const goalName = selectedGoalId && goals.length > 0
      ? goals.find(g => g.id === selectedGoalId)?.title || taskTitle
      : taskTitle || "作業セッション";
    
    const tweetText = `🎯 ${goalName} 完了
⏱️ ${formatDuration(result.durationMs)}作業
📊 集中度: ${focusScore}%

#FocusEye #作業記録`;

    return tweetText;
  };

  // テキストをコピー
  const handleCopyTweet = async () => {
    const text = generateTweetText();
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
      setError("コピーに失敗しました");
    }
  };

  // Xで共有
  const handleShareTwitter = async () => {
    const text = generateTweetText();
    const encodedText = encodeURIComponent(text);
    const url = `https://x.com/intent/post?text=${encodedText}`;
    
    if (window.electronAPI?.openExternal) {
      const result = await window.electronAPI.openExternal(url);
      if (!result.success) {
        setError(`Failed to open Twitter: ${result.error}`);
      }
    } else {
      // 非Electron環境用フォールバック
      window.open(url, "twitter-share", "width=550,height=420");
    }
  };

  const handleStartSession = async () => {
    console.log("[App] handleStartSession 呼び出し");
    console.log("[App] window.electronAPI:", window.electronAPI);
    
    if (!window.electronAPI) {
      setError("Electron API not available");
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const sessionTimeMs = convertToMs(sessionDurationValue, sessionDurationUnit);
      
      const response = await window.electronAPI.startSession({
        sessionTimeMs,
        enableAutomation,
        goalId: selectedGoalId,
        taskTitle: taskTitle || undefined,
        taskIntent: taskIntent || undefined,
      });

      if (response.success && response.result) {
        setResult(response.result);
        setSessionView("result");
      } else {
        setError(response.error || "Session failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
    }
  };

  const handleStopSession = async () => {
    if (!window.electronAPI) {
      setError("Electron API not available");
      return;
    }

    // すでに停止処理中の場合は何もしない
    if (!isRunning) {
      return;
    }

    // すぐにUI状態を更新して二重押しを防ぐ
    setIsRunning(false);

    try {
      const response = await window.electronAPI.stopSession();
      if (response.success) {
        console.log("[App] セッション中断:", response.message);
        // セッションは自動的に終了し、結果が返される
      } else {
        setError(response.message || "Failed to stop session");
        // エラーの場合は状態を元に戻す
        setIsRunning(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // エラーの場合は状態を元に戻す
      setIsRunning(true);
    }
  };

  const handleInitializeDatabase = async () => {
    setIsInitializingDb(true);
    setError(null);
    
    try {
      if (!window.electronAPI?.initDatabase) {
        setError("Electron API not available");
        return;
      }

      const response = await window.electronAPI.initDatabase();
      if (response.success) {
        setSuccessMessage("✅ Database initialized successfully!");
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(`Database initialization failed: ${response.error}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsInitializingDb(false);
    }
  };

  const handleCreateGoal = async () => {
    const logs: string[] = [];
    const addLog = (msg: string) => {
      logs.push(msg);
      setDebugLog(prev => [...prev, msg]);
      console.log("[App]", msg);
    };

    addLog("=== Starting Create Goal ===");

    if (!window.electronAPI?.createGoal) {
      const msg = "❌ Electron API not available";
      addLog(msg);
      setError(msg);
      return;
    }

    if (!newGoalTitle) {
      const msg = "❌ Please fill in goal title";
      addLog(msg);
      setError(msg);
      return;
    }

    try {
      setError(null);
      setSuccessMessage(null);
      
      const now = Date.now();
      const targetTimeMs = convertToMs(newGoalTargetValue, newGoalTargetUnit);
      const endDate = now + (newGoalDays * 24 * 60 * 60 * 1000);

      const goalData = {
        title: newGoalTitle,
        target_time_ms: targetTimeMs,
        start_date: now,
        end_date: endDate,
        is_active: true,
      };

      addLog(`📝 Creating goal: "${newGoalTitle}" with data:`);
      addLog(JSON.stringify(goalData, null, 2));

      const response = await window.electronAPI.createGoal(goalData);

      addLog(`📨 Response from IPC: ${JSON.stringify(response)}`);

      if (response.success && response.goal) {
        addLog(`✅ Goal created successfully!`);
        addLog(`🔑 New Goal ID: ${response.goal.id}`);
        
        setGoals([...goals, response.goal]);
        setNewGoalTitle("");
        setNewGoalTargetValue(5);
        setNewGoalTargetUnit("hours");
        setNewGoalDays(7);
        setShowGoalForm(false);
        setError(null);
        setSuccessMessage(`✅ Goal "${response.goal.title}" created successfully! (ID: ${response.goal.id})`);
        
        // 5秒後に成功メッセージをクリア
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        const errMsg = `❌ Failed: ${response.error || "Unknown error"}`;
        addLog(errMsg);
        setError(response.error || "Failed to create goal");
      }
    } catch (e) {
      const errMsg = `❌ Exception: ${e instanceof Error ? e.message : String(e)}`;
      addLog(errMsg);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      addLog("=== End Create Goal ===");
    }
  };

  const formatDuration = (ms: number) => {
    const totalSec = Math.round(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    
    if (min === 0) {
      return `${sec}秒`;
    } else if (sec === 0) {
      return `${min}分`;
    } else {
      return `${min}分${sec}秒`;
    }
  };

  const formatPercentage = (ms: number, totalMs: number) => {
    const pct = ((ms / totalMs) * 100).toFixed(1);
    return `${pct}%`;
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const getAppsInCategory = (category: string, appLogs: AppLog[], usageSummary: Record<string, number>) => {
    // カテゴリに属するログをフィルタリング
    const categoryLogs = appLogs.filter(log => log.category === category);
    
    // アプリ名ごとに集計（browsingフィールドも含めて詳細化）
    const appUsage = new Map<string, { ms: number; browsingTitles: Set<string> }>();
    
    categoryLogs.forEach(log => {
      const key = log.appDisplayName;
      const existing = appUsage.get(key);
      
      if (existing) {
        // 既に追加されている場合は browsingTitles のみ追加
        if (log.browsing) {
          existing.browsingTitles.add(log.browsing);
        }
      } else {
        const browsingTitles = new Set<string>();
        if (log.browsing) {
          browsingTitles.add(log.browsing);
        }
        // usageSummary から正確な使用時間を取得
        const ms = usageSummary[key] || 0;
        appUsage.set(key, { ms, browsingTitles });
      }
    });
    
    // 配列に変換してソート
    return Array.from(appUsage.entries())
      .map(([appName, data]) => ({ appName, ...data }))
      .sort((a, b) => b.ms - a.ms);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Focus Eye</h1>
          <p className="text-slate-400">セッショントラッカー & アプリ使用状況分析</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setCurrentTab("session")}
            className={`px-6 py-3 font-bold rounded-lg transition ${
              currentTab === "session"
                ? "bg-blue-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            📊 セッション
          </button>
          <button
            onClick={() => setCurrentTab("goals")}
            className={`px-6 py-3 font-bold rounded-lg transition ${
              currentTab === "goals"
                ? "bg-blue-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            🎯 ゴール
          </button>
        </div>

        {/* Tab Content */}
        {currentTab === "goals" ? (
          <GoalsStatsView 
            goals={goals} 
            onCreateGoal={() => {
              setCurrentTab("session");
              setShowGoalForm(true);
            }}
          />
        ) : (
          <>
            {/* Session Form or Result View */}
            {sessionView === "form" ? (
              <>
            {/* Session Controls */}
            <div className="bg-slate-700 rounded-lg p-6 mb-8 shadow-lg">
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-slate-200">
                  ゴール選択
                </label>
                <button
                  onClick={() => setShowGoalForm(!showGoalForm)}
                  disabled={isRunning}
                  className="text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50"
                >
                  {showGoalForm ? "キャンセル" : "+ 新規ゴール"}
                </button>
              </div>
              
              {showGoalForm && (
                <div className="mb-4 p-4 bg-slate-600 rounded-lg space-y-3">
                  <input
                    type="text"
                    placeholder="ゴールタイトル (例: Electronアプリ完成)"
                    value={newGoalTitle}
                    onChange={(e) => setNewGoalTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-500 border border-slate-400 rounded text-white placeholder-slate-300"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">目標時間</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="1"
                          value={newGoalTargetValue}
                          onChange={(e) => setNewGoalTargetValue(parseInt(e.target.value) || 1)}
                          className="flex-1 px-3 py-2 bg-slate-500 border border-slate-400 rounded text-white"
                        />
                        <select
                          value={newGoalTargetUnit}
                          onChange={(e) => setNewGoalTargetUnit(e.target.value as "seconds" | "minutes" | "hours")}
                          className="px-2 py-2 bg-slate-500 border border-slate-400 rounded text-white text-sm"
                        >
                          <option value="seconds">秒</option>
                          <option value="minutes">分</option>
                          <option value="hours">時間</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">期間 (日数)</label>
                      <input
                        type="number"
                        min="1"
                        value={newGoalDays}
                        onChange={(e) => setNewGoalDays(parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 bg-slate-500 border border-slate-400 rounded text-white"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleCreateGoal}
                    className="w-full py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded transition"
                  >
                    ゴール作成
                  </button>
                </div>
              )}
              
              <select
                value={selectedGoalId ?? ""}
                onChange={(e) => setSelectedGoalId(e.target.value ? parseInt(e.target.value) : null)}
                disabled={isRunning}
                className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded text-white disabled:opacity-50"
              >
                <option value="">その他（臨時セッション）</option>
                {goals.filter(goal => goal.is_active).map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
              </select>
            </div>

            {/* タスクタイトル: ゴール未選択時のみ表示（アドホックセッション） */}
            {!selectedGoalId && (
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  タスク名 (任意)
                </label>
                <input
                  type="text"
                  placeholder="例: Electronアプリ実装"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  disabled={isRunning}
                  className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded text-white disabled:opacity-50 placeholder-slate-400"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                タスク目的 (任意)
              </label>
              <input
                type="text"
                placeholder="例: ログ機能を完成させる"
                value={taskIntent}
                onChange={(e) => setTaskIntent(e.target.value)}
                disabled={isRunning}
                className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded text-white disabled:opacity-50 placeholder-slate-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                セッション時間
              </label>
              <div className="flex gap-3">
                <input
                  type="number"
                  min="1"
                  value={sessionDurationValue}
                  onChange={(e) => setSessionDurationValue(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={isRunning}
                  className="flex-1 px-4 py-2 bg-slate-600 border border-slate-500 rounded text-white disabled:opacity-50"
                />
                <select
                  value={sessionDurationUnit}
                  onChange={(e) => setSessionDurationUnit(e.target.value as "seconds" | "minutes" | "hours")}
                  disabled={isRunning}
                  className="px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white disabled:opacity-50"
                >
                  <option value="seconds">秒</option>
                  <option value="minutes">分</option>
                  <option value="hours">時間</option>
                </select>
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="automation"
                checked={enableAutomation}
                onChange={(e) => setEnableAutomation(e.target.checked)}
                disabled={isRunning}
                className="w-4 h-4 rounded disabled:opacity-50"
              />
              <label htmlFor="automation" className="ml-2 text-sm text-slate-200">
                ブラウザトラッキングを有効化 (AppleScript - 自動化権限が必要)
              </label>
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleStartSession}
                disabled={isRunning}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-500 text-white font-bold rounded-lg transition"
              >
                {isRunning ? "セッション実行中..." : "[セッション開始]"}
              </button>
              
              {isRunning && (
                <button
                  onClick={handleStopSession}
                  className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition"
                >
                  中断
                </button>
              )}
            </div>
          </div>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-900 border border-red-700 rounded-lg p-4 mb-8 text-red-200">
            <p className="font-bold">エラー</p>
            <p>{error}</p>
            {error.includes("Database not initialized") && (
              <button
                onClick={handleInitializeDatabase}
                disabled={isInitializingDb}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-500 text-white font-bold rounded transition"
              >
                {isInitializingDb ? "初期化中..." : "データベースを初期化"}
              </button>
            )}
          </div>
        )}

        {/* 成功メッセージ表示 */}
        {successMessage && (
          <div className="bg-green-900 border border-green-700 rounded-lg p-4 mb-8 text-green-200">
            <p>{successMessage}</p>
          </div>
        )}
        </>
            ) : (
              <>
                {/* Session Results Screen */}
                {result && (
                  <div className="bg-slate-700 rounded-lg p-6 shadow-lg">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-2xl font-bold text-white">セッション結果</h2>
                      <button
                        onClick={() => {
                          setSessionView("form");
                          setResult(null);
                        }}
                        className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded transition"
                      >
                        ← 新規セッション
                      </button>
                    </div>

                    {/* Share Buttons */}
                    <div className="flex gap-3 mb-6">
                      <button
                        onClick={handleCopyTweet}
                        className={`flex-1 py-3 font-bold rounded transition ${
                          copySuccess
                            ? "bg-green-600 text-white"
                            : "bg-blue-600 hover:bg-blue-700 text-white"
                        }`}
                      >
                        {copySuccess ? "✓ コピー完了" : "📋 ツイートをコピー"}
                      </button>
                      <button
                        onClick={handleShareTwitter}
                        className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded transition"
                      >
                        𝕏 ツイートする
                      </button>
                    </div>

                    {/* Summary */}
                    <div className="grid grid-cols-3 gap-4 mb-8">
                      <div className="bg-slate-600 rounded p-4">
                <p className="text-slate-400 text-sm">作業時間</p>
                <p className="text-white text-lg font-bold">{formatDuration(result.durationMs)}</p>
              </div>
              <div className="bg-slate-600 rounded p-4">
                <p className="text-slate-400 text-sm">アプリ切替回数</p>
                <p className="text-white text-lg font-bold">{result.appLogs.length}</p>
              </div>
              <div className="bg-slate-600 rounded p-4">
                <p className="text-slate-400 text-sm">使用アプリ数</p>
                <p className="text-white text-lg font-bold">{Object.keys(result.usageSummary).length}</p>
              </div>
            </div>

            {/* Task Relevance Score */}
            {result.taskRelevanceScore !== undefined && (
              <div className="mb-8 bg-gradient-to-r from-blue-900 to-blue-800 rounded-lg p-6">
                <h3 className="text-lg font-bold text-white mb-4">📊 タスク関連度分析</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-blue-200 text-sm mb-1">総合集中度スコア</p>
                    <p className="text-white text-3xl font-bold">
                      {(result.taskRelevanceScore * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="flex flex-col justify-end">
                    <div className="h-4 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-blue-500 transition-all duration-500"
                        style={{ width: `${result.taskRelevanceScore * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-green-900/30 rounded p-3">
                    <p className="text-green-200 mb-1">✅ タスク関連時間</p>
                    <p className="text-white font-bold">
                      {formatDuration(result.taskRelevantTimeMs || 0)}
                      <span className="text-green-300 ml-2">
                        ({formatPercentage(result.taskRelevantTimeMs || 0, result.durationMs)})
                      </span>
                    </p>
                  </div>
                  <div className="bg-red-900/30 rounded p-3">
                    <p className="text-red-200 mb-1">❌ 集中阻害時間</p>
                    <p className="text-white font-bold">
                      {formatDuration(result.taskIrrelevantTimeMs || 0)}
                      <span className="text-red-300 ml-2">
                        ({formatPercentage(result.taskIrrelevantTimeMs || 0, result.durationMs)})
                      </span>
                    </p>
                  </div>
                </div>
              </div>
                    )}

                    {/* カテゴリ使用時間（トグル形式） */}
                    <div className="mb-8">
                      <h3 className="text-lg font-bold text-white mb-4">カテゴリ別使用時間</h3>
                      <div className="space-y-2">
                        {Object.entries(result.categoryUsageSummary)
                          .filter(([_, ms]) => ms > 0)
                          .sort(([_, a], [__, b]) => b - a)
                          .map(([category, ms]) => {
                            const isExpanded = expandedCategories.has(category);
                            const appsInCategory = getAppsInCategory(category, result.appLogs, result.usageSummary);
                            
                            return (
                              <div key={category} className="bg-slate-600/40 rounded-lg overflow-hidden border border-slate-500/30">
                                {/* カテゴリヘッダー（クリック可能） */}
                                <button
                                  onClick={() => toggleCategory(category)}
                                  className="w-full flex items-center justify-between p-4 hover:bg-slate-500/50 transition"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-slate-300 text-sm">
                                      {isExpanded ? '▼' : '▶'}
                                    </span>
                                    <span className="text-slate-100 font-semibold text-lg">{category}</span>
                                    <span className="text-slate-400 text-sm">({appsInCategory.length}個)</span>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <span className="text-slate-300">{formatDuration(ms)}</span>
                                    <span className="text-slate-100 font-bold w-14 text-right">
                                      {formatPercentage(ms, result.durationMs)}
                                    </span>
                                  </div>
                                </button>
                                
                                {/* 展開時：アプリ一覧 */}
                                {isExpanded && (
                                  <div className="bg-slate-700/60 px-4 pb-3 pt-1 space-y-2">
                                    {appsInCategory.map((app, idx) => (
                                      <div key={idx} className="pl-4 py-3 bg-slate-600/60 rounded border-l-2 border-slate-400">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-slate-100 font-medium">{app.appName}</span>
                                          <div className="flex items-center gap-3">
                                            <span className="text-slate-300 text-sm">{formatDuration(app.ms)}</span>
                                            <span className="text-slate-200 text-sm w-14 text-right font-semibold">
                                              {formatPercentage(app.ms, result.durationMs)}
                                            </span>
                                          </div>
                                        </div>
                                        {/* ブラウザタイトル表示 */}
                                        {app.browsingTitles.size > 0 && (
                                          <div className="mt-2 pl-3 space-y-1">
                                            {Array.from(app.browsingTitles).slice(0, 5).map((title, titleIdx) => (
                                              <div key={titleIdx} className="text-slate-300 text-xs truncate flex items-start gap-1">
                                                <span className="text-slate-400 flex-shrink-0">📄</span>
                                                <span className="break-all">{title}</span>
                                              </div>
                                            ))}
                                            {app.browsingTitles.size > 5 && (
                                              <div className="text-slate-400 text-xs italic pl-4">
                                                他 {app.browsingTitles.size - 5} 件のタイトル
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>

                    {/* App Usage */}
                    <div>
                      <h3 className="text-lg font-bold text-white mb-4">アプリケーション別使用時間</h3>
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {Object.entries(result.usageSummary)
                          .sort(([_, a], [__, b]) => b - a)
                          .map(([appName, ms]) => (
                            <div key={appName} className="flex items-center justify-between bg-slate-600 rounded p-3">
                              <span className="text-slate-200 truncate">{appName}</span>
                              <div className="flex items-center gap-4 flex-shrink-0">
                                <span className="text-slate-400">{formatDuration(ms)}</span>
                                <span className="text-slate-300 font-bold w-12 text-right">
                                  {formatPercentage(ms, result.durationMs)}
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            </>
        )}
      </div>
    </div>
  );
}
