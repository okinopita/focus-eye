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
}

export interface SessionResult {
  startTime: number;
  endTime: number;
  durationMs: number;
  appLogs: AppLog[];
  usageSummary: Record<string, number>; // appDisplayName -> duration in ms
  categoryUsageSummary: Record<AppCategory, number>; // category -> duration in ms
}

export interface IpcSessionRequest {
  sessionTimeMs: number;
  enableAutomation?: boolean;
  taskTitle?: string;
  taskIntent?: string;
}

export interface IpcSessionResponse {
  success: boolean;
  error?: string;
  result?: SessionResult;
}
