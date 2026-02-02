/**
 * App categorization utility based on app name and browsing content.
 */
import type { AppCategory } from "./types.js";
import type { AIClassificationOutput, AppWithRelevanceScore } from "../ai/types.js";

export function categorizeApp(
  appDisplayName: string,
  appExecutable: string,
  browsing?: string
): AppCategory {
  const name = appDisplayName.toLowerCase();
  const exec = appExecutable.toLowerCase();
  const browse = (browsing ?? "").toLowerCase();

  // GAME: gaming apps
  if (exec.includes("leagueoflegends") || exec.includes("valorant")) {
    return "GAME";
  }
  if (name.includes("epic") || name.includes("game")) {
    return "GAME";
  }

  // WORK: IDEs, terminals, productivity
  if (exec.includes("code") || exec.includes("studio") || exec.includes("intellij") || exec.includes("android studio")) {
    return "WORK";
  }
  if (name.includes("visual studio") || name.includes("vscode") || name.includes("xcode") || name.includes("terminal") || name.includes("iterm")) {
    return "WORK";
  }
  if (name.includes("word") || name.includes("excel") || name.includes("notion") || name.includes("figma")) {
    return "WORK";
  }

  // BROWSER: Chrome, Safari, Edge, Firefox
  if (name.includes("chrome") || name.includes("safari") || name.includes("edge") || name.includes("firefox")) {
    return "BROWSER";
  }

  // COMMUNICATION: Slack, Discord, etc.
  if (name.includes("slack") || name.includes("discord") || name.includes("teams") || name.includes("zoom")) {
    return "COMMUNICATION";
  }

  // ENTERTAINMENT: YouTube, Netflix, Twitch in browsing content
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
    BROWSER: 0,
    COMMUNICATION: 0,
    GAME: 0,
    ENTERTAINMENT: 0,
    OTHER: 0,
  };

  if (appLogs.length === 0) {
    return { appSummary, categorySummary };
  }

  // Sort by timestamp to calculate time between consecutive logs
  const sorted = [...appLogs].sort((a, b) => a.timestamp - b.timestamp);

  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    const duration = next.timestamp - curr.timestamp;

    appSummary[curr.appDisplayName] = (appSummary[curr.appDisplayName] ?? 0) + duration;
    categorySummary[curr.category] = (categorySummary[curr.category] ?? 0) + duration;
  }

  // Add final log entry (use a default 5-second duration for the last entry)
  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    const duration = 5000; // 5 seconds for the last log
    appSummary[last.appDisplayName] = (appSummary[last.appDisplayName] ?? 0) + duration;
    categorySummary[last.category] = (categorySummary[last.category] ?? 0) + duration;
  }

  return { appSummary, categorySummary };
}

/**
 * Apply AI classification results to app logs
 * Updates categories for apps that were classified as OTHER or BROWSER
 */
export function applyAIClassificationToLogs(
  appLogs: Array<{ appDisplayName: string; browsing?: string; timestamp: number; category: AppCategory; task_relevance_score?: number }>,
  aiResult: AppWithRelevanceScore[]
): Array<{ appDisplayName: string; browsing?: string; timestamp: number; category: AppCategory | string; task_relevance_score?: number }> {
  // Build a map of app name -> { category, score } from AI result
  const reclassificationMap = new Map<string, { category: string; score: number }>();
  
  for (const app of aiResult) {
    reclassificationMap.set(app.app_name, {
      category: app.new_category,
      score: app.task_relevance_score,
    });
  }

  // Apply reclassification to logs that were OTHER or BROWSER
  return appLogs.map((log) => {
    if ((log.category === "OTHER" || log.category === "BROWSER")) {
      // For BROWSER category with browsing field, match by browsing title
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
 * Apply task relevance scores to all logs based on their category
 * This should be called after AI classification to ensure all logs have scores
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
 * Get task relevance score for a category
 */
function getCategoryRelevanceScore(category: string): number {
  switch (category) {
    case "WORK":
      return 1.0; // Directly task-related
    case "COMMUNICATION":
      return 0.5; // Neutral - may be work-related or personal
    case "BROWSER":
      return 0.5; // Neutral - depends on content
    case "ENTERTAINMENT":
      return 0.0; // Clearly not task-related
    case "GAME":
      return 0.0; // Clearly distraction
    case "OTHER":
      return -1.0; // Unknown - exclude from calculation
    default:
      return -1.0;
  }
}

/**
 * Calculate task relevance metrics for a session
 * 
 * @param appLogs - App logs with task_relevance_score
 * @returns Aggregated task relevance metrics
 */
export function calculateTaskRelevanceMetrics(
  appLogs: Array<{ timestamp: number; task_relevance_score?: number }>
): {
  taskRelevanceScore: number; // Overall score 0.0-1.0
  taskRelevantTimeMs: number; // Time with score >= 0.5
  taskIrrelevantTimeMs: number; // Time with score < 0.5
  unknownTimeMs: number; // Time with score = -1.0 (excluded)
} {
  if (appLogs.length === 0) {
    return {
      taskRelevanceScore: 0,
      taskRelevantTimeMs: 0,
      taskIrrelevantTimeMs: 0,
      unknownTimeMs: 0,
    };
  }

  // Calculate time deltas between consecutive logs
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
      // Unknown - exclude from calculation
      unknownTimeMs += deltaMs;
    } else if (score >= 0.5) {
      // Task-relevant (WORK, COMMUNICATION)
      taskRelevantTimeMs += deltaMs;
      totalScoredTimeMs += deltaMs;
      weightedScoreSum += score * deltaMs;
    } else {
      // Task-irrelevant (ENTERTAINMENT, GAME)
      taskIrrelevantTimeMs += deltaMs;
      totalScoredTimeMs += deltaMs;
      weightedScoreSum += score * deltaMs;
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
