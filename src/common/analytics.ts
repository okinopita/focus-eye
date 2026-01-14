/**
 * App categorization utility based on app name and browsing content.
 */
import type { AppCategory } from "./types.js";

export function categorizeApp(
  appDisplayName: string,
  appExecutable: string,
  browsing?: string
): AppCategory {
  const name = appDisplayName.toLowerCase();
  const exec = appExecutable.toLowerCase();
  const browse = (browsing ?? "").toLowerCase();

  // GAME: Steam, Epic Games, gaming apps
  if (exec.includes("steam") || exec.includes("epic") || exec.includes("leagueoflegends") || exec.includes("valorant")) {
    return "GAME";
  }
  if (name.includes("steam") || name.includes("epic") || name.includes("game")) {
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
