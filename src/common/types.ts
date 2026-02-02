/**
 * Shared type definitions between main and renderer processes.
 */

export type AppCategory = "WORK" | "BROWSER" | "COMMUNICATION" | "GAME" | "ENTERTAINMENT" | "OTHER";

export interface AppLog {
  timestamp: number;
  appDisplayName: string;
  appExecutable: string;
  browsing?: string;
  category: AppCategory;
  task_relevance_score?: number; // -1.0 (unknown) | 0.0 (unrelated) | 0.5 (neutral) | 1.0 (related)
}

export interface SessionResult {
  startTime: number;
  endTime: number;
  durationMs: number;
  appLogs: AppLog[];
  usageSummary: Record<string, number>; // appDisplayName -> duration in ms
  categoryUsageSummary: Record<AppCategory, number>; // category -> duration in ms
  taskRelevanceScore?: number; // 全体の集中度スコア (0.0-1.0)
  taskRelevantTimeMs?: number; // タスク関連の作業時間 (score >= 0.5)
  taskIrrelevantTimeMs?: number; // タスク無関係の時間 (score < 0.5)
}

export interface IpcSessionRequest {
  sessionTimeMs: number;
  enableAutomation?: boolean;
  goalId: number | null;
  taskTitle?: string;
  taskIntent?: string;
}

export interface IpcSessionResponse {
  success: boolean;
  error?: string;
  result?: SessionResult;
}

export interface Goal {
  id: number;
  title: string;
  target_time_ms: number;
  start_date: number;
  end_date: number;
  is_active: boolean;
  created_at: number;
}

export interface NewGoal {
  title: string;
  target_time_ms: number;
  start_date: number;
  end_date: number;
  is_active?: boolean;
}
