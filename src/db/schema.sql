-- FocusEye Database Schema
-- SQLite3

-- ============================================================
-- Goals Table (任意の期間で設定可能)
-- ============================================================
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,            -- e.g. "1月の集中期間", "Electronアプリ完成"
  target_time_ms INTEGER NOT NULL,    -- 目標作業時間（ミリ秒）
  start_date INTEGER NOT NULL,    -- Unix timestamp (ms) - 目標開始日時
  end_date INTEGER NOT NULL,      -- Unix timestamp (ms) - 目標終了日時
  is_active BOOLEAN DEFAULT 1,    -- 有効フラグ
  created_at INTEGER NOT NULL     -- Unix timestamp (ms) - 作成日時
);

-- ============================================================
-- Sessions Table
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Goal reference (nullable for ad-hoc sessions)
  goal_id INTEGER,
  
  -- Task information (1対1対応)
  task_title TEXT NOT NULL,
  task_intent TEXT,
  
  -- Session timing
  start_time INTEGER NOT NULL,  -- Unix timestamp (ms) - セッション開始時刻
  end_time INTEGER NOT NULL,    -- Unix timestamp (ms) - セッション終了時刻
  duration_ms INTEGER NOT NULL,  -- セッション総時間
  
  -- Category-based usage time (ms)
  work_ms INTEGER DEFAULT 0,
  communication_ms INTEGER DEFAULT 0,
  game_ms INTEGER DEFAULT 0,
  entertainment_ms INTEGER DEFAULT 0,
  browser_ms INTEGER DEFAULT 0,
  other_ms INTEGER DEFAULT 0,
  
  -- Task relevance scoring
  task_relevance_score REAL,      -- 0.0-1.0 (weighted average)
  task_relevant_time_ms INTEGER,   -- Time with score >= 0.5
  task_irrelevant_time_ms INTEGER, -- Time with score < 0.5
  
  -- Feature flags
  browser_automation_enabled BOOLEAN DEFAULT 0,  -- ブラウザタイトル取得機能を使用したか
  
  -- Meta information
  is_demo BOOLEAN DEFAULT 0,       -- デモデータフラグ（プレゼン用）
  created_at INTEGER NOT NULL,     -- 実際の記録日時（デモモードでは start_time と異なる可能性）
  
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL
);

-- ============================================================
-- Settings Table
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL,   -- Unix timestamp (ms)
  updated_at INTEGER NOT NULL    -- Unix timestamp (ms)
);

-- ============================================================
-- Indexes for Performance
-- ============================================================

-- Goals by active and date range
CREATE INDEX IF NOT EXISTS idx_goals_is_active ON goals(is_active);
CREATE INDEX IF NOT EXISTS idx_goals_date_range ON goals(start_date, end_date);

-- Sessions by goal
CREATE INDEX IF NOT EXISTS idx_sessions_goal_id ON sessions(goal_id);

-- Sessions by date range (for weekly/monthly statistics)
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

-- Sessions by demo flag (for filtering real vs demo data)
CREATE INDEX IF NOT EXISTS idx_sessions_is_demo ON sessions(is_demo);

-- ============================================================
-- Initial Settings
-- ============================================================
INSERT OR IGNORE INTO settings (key, value, created_at, updated_at)
VALUES 
  ('weekly_session_goal', '3', strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('app_version', '0.1.0', strftime('%s','now') * 1000, strftime('%s','now') * 1000);
