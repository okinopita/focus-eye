/**
 * アプリ名とブラウジングコンテンツに基づいたアプリ分稽ユーティリティ。
 */
import type { AppCategory } from "./types.js";
import type { AIClassificationOutput, AppWithRelevanceScore } from "../ai/types.js";
import { MIN_INTERVAL_MS } from "./consts.js";

export function categorizeApp(
  appDisplayName: string,
  appExecutable: string,
  browsing?: string
): AppCategory {
  const name = appDisplayName.toLowerCase();
  const exec = appExecutable.toLowerCase();
  const browse = (browsing ?? "").toLowerCase();

  // GAME: ゲームアプリ
  if (exec.includes("leagueoflegends") || exec.includes("valorant")) {
    return "GAME";
  }
  if (name.includes("epic") || name.includes("game")) {
    return "GAME";
  }

  // WORK: IDE、ターミナル、生産性ツール
  if (exec.includes("code") || exec.includes("studio") || exec.includes("intellij") || exec.includes("android studio")) {
    return "WORK";
  }
  if (name.includes("visual studio") || name.includes("vscode") || name.includes("xcode") || name.includes("terminal") || name.includes("iterm")) {
    return "WORK";
  }
  
  // PRODUCTIVITY: 生産的だが関連性不明なツール
  if (name.includes("word") || name.includes("excel") || name.includes("notion") || name.includes("figma")) {
    return "PRODUCTIVITY";
  }

  // BROWSER: Chrome, Safari, Edge, Firefox
  if (name.includes("chrome") || name.includes("safari") || name.includes("edge") || name.includes("firefox")) {
    return "BROWSER";
  }

  // COMMUNICATION: Slack, Discord, etc.
  if (name.includes("slack") || name.includes("discord") || name.includes("teams") || name.includes("zoom")) {
    return "COMMUNICATION";
  }

  // ENTERTAINMENT: ブラウジングコンテンツ内のYouTube、Netflix、Twitchなど
  if (browse.includes("youtube") || browse.includes("netflix") || browse.includes("twitch") || browse.includes("tiktok")) {
    return "ENTERTAINMENT";
  }

  return "OTHER";
}

export function calculateUsageSummary(
  appLogs: Array<{ appDisplayName: string; timestamp: number; category: AppCategory }>
): { appSummary: Record<string, number>; categorySummary: Record<AppCategory, number> } {
  const appSummary: Record<string, number> = {};
  const categorySummary: Record<AppCategory, number> = {
    WORK: 0,
    PRODUCTIVITY: 0,
    BROWSER: 0,
    COMMUNICATION: 0,
    GAME: 0,
    ENTERTAINMENT: 0,
    OTHER: 0,
  };

  if (appLogs.length === 0) {
    return { appSummary, categorySummary };
  }

  // タイムスタンプでソートして連続したログ間の時間を計算
  const sorted = [...appLogs].sort((a, b) => a.timestamp - b.timestamp);

  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    const duration = next.timestamp - curr.timestamp;

    appSummary[curr.appDisplayName] = (appSummary[curr.appDisplayName] ?? 0) + duration;
    categorySummary[curr.category] = (categorySummary[curr.category] ?? 0) + duration;
  }

  // 最終ログエントリを追加（最後のエントリにはデフォルトの5秒間隔を使用）
  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    const duration = MIN_INTERVAL_MS; // 最後のログには5秒
    appSummary[last.appDisplayName] = (appSummary[last.appDisplayName] ?? 0) + duration;
    categorySummary[last.category] = (categorySummary[last.category] ?? 0) + duration;
  }

  return { appSummary, categorySummary };
}

/**
 * AI分類結果をアプリログに適用
 * OTHERまたはBROWSERに分類されたアプリのカテゴリを更新
 */
export function applyAIClassificationToLogs(
  appLogs: Array<{ appDisplayName: string; browsing?: string; timestamp: number; category: AppCategory; task_relevance_score?: number }>,
  aiResult: AppWithRelevanceScore[]
): Array<{ appDisplayName: string; browsing?: string; timestamp: number; category: AppCategory | string; task_relevance_score?: number }> {
  // AI結果からアプリ名 -> { category, score } のマップを作成
  const reclassificationMap = new Map<string, { category: string; score: number }>();
  
  for (const app of aiResult) {
    reclassificationMap.set(app.app_name, {
      category: app.new_category,
      score: app.task_relevance_score,
    });
  }

  // OTHER または BROWSER だったログに再分類を適用
  return appLogs.map((log) => {
    if ((log.category === "OTHER" || log.category === "BROWSER")) {
      // browsing フィールド付きBROWSERカテゴリの場合、ブラウジングタイトルで照合
      const lookupKey = log.category === "BROWSER" && log.browsing 
        ? log.browsing 
        : log.appDisplayName;
      
      if (reclassificationMap.has(lookupKey)) {
        const classification = reclassificationMap.get(lookupKey)!;
        return {
          ...log,
          category: classification.category || "OTHER",
          task_relevance_score: classification.score,
        };
      }
    }
    return log;
  });
}

/**
 * カテゴリに基づいて全ログにタスク関連スコアを適用
 * AI分類後に呼び出して全ログにスコアが設定されるようにする
 */
export function applyTaskRelevanceScores<T extends { category: AppCategory | string; task_relevance_score?: number }>(
  appLogs: T[]
): Array<T & { task_relevance_score: number }> {
  return appLogs.map((log) => ({
    ...log,
    task_relevance_score: log.task_relevance_score ?? getCategoryRelevanceScore(log.category),
  }));
}

/**
 * カテゴリのタスク関連スコアを取得
 * 
 * 1.0  = WORK (タスク関連作業)
 * 0.75 = PRODUCTIVITY (生産的だが関連性不明)
 * 0.5  = COMMUNICATION (ニュートラル)
 * 0.0  = ENTERTAINMENT (無関係)
 * 0.0  = GAME (無関係)
 * -1.0 = OTHER (不明、スコア計算から除外)
 */
function getCategoryRelevanceScore(category: string): number {
  switch (category) {
    case "WORK":
      return 1.0; // タスクに関連する作業
    case "PRODUCTIVITY":
      return 0.75; // 生産的だが関連性不明
    case "COMMUNICATION":
      return 0.5; // 中立 - 仕事関連または個人的かもしれない
    case "BROWSER":
      return 0.5; // 中立 - コンテンツに依存
    case "ENTERTAINMENT":
      return 0.0; // 明らかにタスク無関連
    case "GAME":
      return 0.0; // 明らかな気晴らし
    case "OTHER":
      return -1.0; // 不明 - 計算から除外
    default:
      return -1.0;
  }
}

/**
 * セッションのタスク関連メトリクスを計算
 * 
 * @param appLogs - task_relevance_score 付きアプリログ
 * @returns 集計されたタスク関連メトリクス
 */
export function calculateTaskRelevanceMetrics(
  appLogs: Array<{ timestamp: number; task_relevance_score?: number }>
): {
  taskRelevanceScore: number; // 総合スコア 0.0-1.0
  taskRelevantTimeMs: number; // スコア >= 0.5 の時間
  taskIrrelevantTimeMs: number; // スコア < 0.5 の時間
  unknownTimeMs: number; // スコア = -1.0 の時間（除外）
} {
  if (appLogs.length === 0) {
    return {
      taskRelevanceScore: 0,
      taskRelevantTimeMs: 0,
      taskIrrelevantTimeMs: 0,
      unknownTimeMs: 0,
    };
  }

  // 連続したログ間の時間差を計算
  const sortedLogs = [...appLogs].sort((a, b) => a.timestamp - b.timestamp);
  
  let taskRelevantTimeMs = 0;
  let taskIrrelevantTimeMs = 0;
  let unknownTimeMs = 0;
  let totalScoredTimeMs = 0;
  let weightedScoreSum = 0;

  for (let i = 0; i < sortedLogs.length - 1; i++) {
    const currentLog = sortedLogs[i];
    const nextLog = sortedLogs[i + 1];
    const deltaMs = nextLog.timestamp - currentLog.timestamp;
    const score = currentLog.task_relevance_score ?? -1.0;

    if (score === -1.0) {
      // 不明 - 計算から除外
      unknownTimeMs += deltaMs;
    } else if (score >= 0.5) {
      // タスク関連（WORK、PRODUCTIVITY、COMMUNICATION）
      taskRelevantTimeMs += deltaMs;
      totalScoredTimeMs += deltaMs;
      weightedScoreSum += score * deltaMs;
    } else {
      // タスク無関連（ENTERTAINMENT、GAME）
      taskIrrelevantTimeMs += deltaMs;
      totalScoredTimeMs += deltaMs;
      weightedScoreSum += score * deltaMs;
    }
  }

  // 最終ログエントリを追加（最後のエントリにはデフォルトの5秒間隔を使用）
  if (sortedLogs.length > 0) {
    const lastLog = sortedLogs[sortedLogs.length - 1];
    const lastDuration = MIN_INTERVAL_MS; // 最後のログには5秒
    const lastScore = lastLog.task_relevance_score ?? -1.0;

    if (lastScore === -1.0) {
      // 不明 - 計算から除外
      unknownTimeMs += lastDuration;
    } else if (lastScore >= 0.5) {
      // タスク関連（WORK、PRODUCTIVITY、COMMUNICATION）
      taskRelevantTimeMs += lastDuration;
      totalScoredTimeMs += lastDuration;
      weightedScoreSum += lastScore * lastDuration;
    } else {
      // タスク無関連（ENTERTAINMENT、GAME）
      taskIrrelevantTimeMs += lastDuration;
      totalScoredTimeMs += lastDuration;
      weightedScoreSum += lastScore * lastDuration;
    }
  }

  const taskRelevanceScore = totalScoredTimeMs > 0 ? weightedScoreSum / totalScoredTimeMs : 0;

  return {
    taskRelevanceScore,
    taskRelevantTimeMs,
    taskIrrelevantTimeMs,
    unknownTimeMs,
  };
}
