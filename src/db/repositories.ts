/**
 * Database Repositories (SQL.js)
 */
import type { Database as SqlJsDatabase, SqlValue } from "sql.js";
import { getDatabase, saveDatabaseToFile } from "./database.js";

// ============================================================
// Types
// ============================================================

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

export interface Session {
  id: number;
  goal_id: number | null;
  task_title: string;
  task_intent: string | null;
  start_time: number;
  end_time: number;
  duration_ms: number;
  work_ms: number;
  communication_ms: number;
  game_ms: number;
  entertainment_ms: number;
  browser_ms: number;
  other_ms: number;
  task_relevance_score: number | null;
  task_relevant_time_ms: number | null;
  task_irrelevant_time_ms: number | null;
  browser_automation_enabled: boolean;
  is_demo: boolean;
  created_at: number;
}

export interface NewSession {
  goal_id?: number | null;
  task_title: string;
  task_intent?: string | null;
  start_time: number;
  end_time: number;
  duration_ms: number;
  work_ms?: number;
  communication_ms?: number;
  game_ms?: number;
  entertainment_ms?: number;
  browser_ms?: number;
  other_ms?: number;
  task_relevance_score?: number;
  task_relevant_time_ms?: number;
  task_irrelevant_time_ms?: number;
  browser_automation_enabled?: boolean;
  is_demo?: boolean;
  created_at?: number;
}

// ============================================================
// Session Repository
// ============================================================

export class SessionRepository {
  private db: SqlJsDatabase;

  constructor() {
    this.db = getDatabase();
  }

  /**
   * Create a new session
   */
  create(session: NewSession): Session {
    const now = Date.now();
    
    console.log("[SessionRepository] Creating session with data:", {
      goal_id: session.goal_id || null,
      task_title: session.task_title,
      start_time: session.start_time,
      end_time: session.end_time,
      duration_ms: session.duration_ms,
    });
    
    // Execute INSERT
    this.db.exec(
      `INSERT INTO sessions (
        goal_id, task_title, task_intent, start_time, end_time, duration_ms,
        work_ms, communication_ms, game_ms, entertainment_ms, browser_ms, other_ms,
        task_relevance_score, task_relevant_time_ms, task_irrelevant_time_ms,
        browser_automation_enabled, is_demo, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.goal_id || null,
        session.task_title,
        session.task_intent || null,
        session.start_time,
        session.end_time,
        session.duration_ms,
        session.work_ms || 0,
        session.communication_ms || 0,
        session.game_ms || 0,
        session.entertainment_ms || 0,
        session.browser_ms || 0,
        session.other_ms || 0,
        session.task_relevance_score || null,
        session.task_relevant_time_ms || null,
        session.task_irrelevant_time_ms || null,
        session.browser_automation_enabled ? 1 : 0,
        session.is_demo ? 1 : 0,
        session.created_at || now,
      ]
    );

    // Get ID immediately (before saving file) - use sqlite_sequence
    const seqResult = this.db.exec(`SELECT seq FROM sqlite_sequence WHERE name = 'sessions'`);
    console.log("[SessionRepository] sqlite_sequence result:", JSON.stringify(seqResult, null, 2));
    
    if (seqResult.length === 0 || seqResult[0].values.length === 0) {
      throw new Error("Failed to get inserted session ID from sqlite_sequence");
    }
    
    const insertedId = seqResult[0].values[0][0] as number;
    console.log("[SessionRepository] Inserted session ID:", insertedId);
    
    saveDatabaseToFile();
    
    if (insertedId === 0) {
      throw new Error("INSERT failed - last_insert_rowid returned 0");
    }
    
    // Fetch the created session using exec()
    const result = this.db.exec(`SELECT * FROM sessions WHERE id = ?`, [insertedId]);
    
    if (result.length === 0 || result[0].values.length === 0) {
      throw new Error(`Failed to fetch created session with ID ${insertedId}`);
    }
    
    const row = result[0].values[0] as SqlValue[];
    return this.mapRowToSession(row);
  }

  /**
   * Get session by ID
   */
  findById(id: number): Session | null {
    const result = this.db.exec(`SELECT * FROM sessions WHERE id = ?`, [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.mapRowToSession(result[0].values[0] as SqlValue[]);
  }

  /**
   * Get sessions by date range
   * @param startDate - Unix timestamp (ms)
   * @param endDate - Unix timestamp (ms)
   */
  findByDateRange(startDate: number, endDate: number, includeDemo: boolean = false): Session[] {
    const sql = includeDemo
      ? `SELECT * FROM sessions WHERE start_time >= ? AND start_time <= ? ORDER BY start_time DESC`
      : `SELECT * FROM sessions WHERE start_time >= ? AND start_time <= ? AND is_demo = 0 ORDER BY start_time DESC`;
    
    const result = this.db.exec(sql, [startDate, endDate]);
    if (result.length === 0) return [];
    return result[0].values.map((row: SqlValue[]) => this.mapRowToSession(row));
  }

  /**
   * Get sessions for current week
   */
  findThisWeek(includeDemo: boolean = false): Session[] {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    return this.findByDateRange(startOfWeek.getTime(), endOfWeek.getTime(), includeDemo);
  }

  /**
   * Get total session time for a specific goal
   * @param goalId - Goal ID to aggregate sessions for
   * @returns Total time in milliseconds
   */
  getTotalTimeByGoal(goalId: number): number {
    const result = this.db.exec(
      `SELECT SUM(duration_ms) as total_time FROM sessions WHERE goal_id = ?`,
      [goalId]
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return 0;
    }
    
    const totalTime = result[0].values[0][0];
    return typeof totalTime === 'number' ? totalTime : 0;
  }

  /**
   * Get all sessions (for demo purposes)
   */
  findAll(limit: number = 100): Session[] {
    const result = this.db.exec(`SELECT * FROM sessions ORDER BY start_time DESC LIMIT ?`, [limit]);
    if (result.length === 0) return [];
    return result[0].values.map((row: SqlValue[]) => this.mapRowToSession(row));
  }

  /**
   * Count sessions this week
   */
  countThisWeek(includeDemo: boolean = false): number {
    const sessions = this.findThisWeek(includeDemo);
    return sessions.length;
  }

  /**
   * Helper: Map SQL row to Session object
   */
  private mapRowToSession(row: SqlValue[]): Session {
    return {
      id: row[0] as number,
      goal_id: row[1] as number | null,
      task_title: row[2] as string,
      task_intent: row[3] as string | null,
      start_time: row[4] as number,
      end_time: row[5] as number,
      duration_ms: row[6] as number,
      work_ms: row[7] as number,
      communication_ms: row[8] as number,
      game_ms: row[9] as number,
      entertainment_ms: row[10] as number,
      browser_ms: row[11] as number,
      other_ms: row[12] as number,
      task_relevance_score: row[13] as number | null,
      task_relevant_time_ms: row[14] as number | null,
      task_irrelevant_time_ms: row[15] as number | null,
      browser_automation_enabled: Boolean(row[16]),
      is_demo: Boolean(row[17]),
      created_at: row[18] as number,
    };
  }
}

// ============================================================
// Goal Repository
// ============================================================

export class GoalRepository {
  private db: SqlJsDatabase;

  constructor() {
    this.db = getDatabase();
  }

  /**
   * Create a new goal
   */
  create(goal: NewGoal): Goal {
    const now = Date.now();
    const isActive = goal.is_active !== false ? 1 : 0;

    console.log("[GoalRepository.create] Starting INSERT with:", {
      title: goal.title,
      target_time_ms: goal.target_time_ms,
      start_date: goal.start_date,
      end_date: goal.end_date,
      is_active: isActive,
      created_at: now,
    });

    // Execute INSERT statement
    this.db.exec(
      `INSERT INTO goals (title, target_time_ms, start_date, end_date, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [goal.title, goal.target_time_ms, goal.start_date, goal.end_date, isActive, now]
    );

    console.log("[GoalRepository.create] INSERT executed");

    // Get the last inserted ID
    const seqResult = this.db.exec(`SELECT seq FROM sqlite_sequence WHERE name = 'goals'`);
    console.log("[GoalRepository.create] sqlite_sequence result:", JSON.stringify(seqResult));

    if (seqResult.length === 0 || seqResult[0].values.length === 0) {
      throw new Error("Failed to get inserted goal ID from sqlite_sequence");
    }

    const insertedId = seqResult[0].values[0][0] as number;
    console.log("[GoalRepository.create] Inserted ID:", insertedId);

    // Save database to file IMMEDIATELY after INSERT
    console.log("[GoalRepository.create] Calling saveDatabaseToFile...");
    saveDatabaseToFile();
    console.log("[GoalRepository.create] Database saved to file");

    // Verify the insert by fetching the record
    const result = this.db.exec(`SELECT * FROM goals WHERE id = ?`, [insertedId]);
    console.log("[GoalRepository.create] Verification SELECT result:", JSON.stringify(result));

    if (result.length === 0 || result[0].values.length === 0) {
      throw new Error(`Failed to fetch created goal with ID ${insertedId}`);
    }

    const mappedGoal = this.mapRowToGoal(result[0].values[0] as SqlValue[]);
    console.log("[GoalRepository.create] Returning mapped goal:", mappedGoal);
    return mappedGoal;
  }

  /**
   * Get goal by ID
   */
  findById(id: number): Goal | null {
    const result = this.db.exec(`SELECT * FROM goals WHERE id = ?`, [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.mapRowToGoal(result[0].values[0] as SqlValue[]);
  }

  /**
   * Get all active goals
   */
  findActive(): Goal[] {
    const result = this.db.exec(`SELECT * FROM goals WHERE is_active = 1 ORDER BY start_date DESC`);
    if (result.length === 0) return [];
    return result[0].values.map((row: SqlValue[]) => this.mapRowToGoal(row));
  }

  /**
   * Get all goals (including inactive)
   */
  findAll(): Goal[] {
    const result = this.db.exec(`SELECT * FROM goals ORDER BY start_date DESC`);
    if (result.length === 0) return [];
    return result[0].values.map((row: SqlValue[]) => this.mapRowToGoal(row));
  }

  /**
   * Get goals by date range
   */
  findByDateRange(startDate: number, endDate: number): Goal[] {
    const result = this.db.exec(
      `SELECT * FROM goals WHERE start_date <= ? AND end_date >= ? ORDER BY start_date DESC`,
      [endDate, startDate]
    );
    if (result.length === 0) return [];
    return result[0].values.map((row: SqlValue[]) => this.mapRowToGoal(row));
  }

  /**
   * Update goal
   */
  update(id: number, updates: Partial<Omit<Goal, 'id' | 'created_at'>>): Goal | null {
    const goal = this.findById(id);
    if (!goal) return null;

    const updatedGoal: Goal = {
      ...goal,
      ...updates,
    };

    this.db.exec(
      `UPDATE goals SET title = ?, target_time_ms = ?, start_date = ?, end_date = ?, is_active = ?
       WHERE id = ?`,
      [
        updatedGoal.title,
        updatedGoal.target_time_ms,
        updatedGoal.start_date,
        updatedGoal.end_date,
        updatedGoal.is_active ? 1 : 0,
        id,
      ]
    );

    saveDatabaseToFile();
    return this.findById(id);
  }

  /**
   * Helper: Map SQL row to Goal object
   */
  private mapRowToGoal(row: SqlValue[]): Goal {
    return {
      id: row[0] as number,
      title: row[1] as string,
      target_time_ms: row[2] as number,
      start_date: row[3] as number,
      end_date: row[4] as number,
      is_active: Boolean(row[5]),
      created_at: row[6] as number,
    };
  }
}

// ============================================================
// Settings Repository
// ============================================================

export class SettingsRepository {
  private db: SqlJsDatabase;

  constructor() {
    this.db = getDatabase();
  }

  /**
   * Get setting value
   */
  get(key: string): string | null {
    const result = this.db.exec(`SELECT value FROM settings WHERE key = ?`, [key]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return result[0].values[0][0] as string;
  }

  /**
   * Set setting value
   */
  set(key: string, value: string): void {
    const now = Date.now();
    this.db.run(
      `INSERT INTO settings (key, value, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
      [key, value, now, now]
    );
    saveDatabaseToFile();
  }

  /**
   * Get weekly session goal
   */
  getWeeklyGoal(): number {
    const value = this.get("weekly_session_goal");
    return value ? parseInt(value, 10) : 3;
  }

  /**
   * Set weekly session goal
   */
  setWeeklyGoal(goal: number): void {
    this.set("weekly_session_goal", goal.toString());
  }
}
