# Database Query Commands (開発環境)

## Goals テーブル（見やすく表示）
sqlite3 /Users/KK/work/ih13/SK32/focus-eye/data/focus-eye.db \
  ".mode column" ".headers on" \
  "SELECT id, title, target_time_ms, start_date, end_date, is_active, created_at FROM goals;"

# Sessions テーブル（見やすく表示）
sqlite3 /Users/KK/work/ih13/SK32/focus-eye/data/focus-eye.db \
  ".mode column" ".headers on" \
  "SELECT id, goal_id, task_title, task_intent, duration_ms, work_ms, communication_ms, game_ms, entertainment_ms, browser_ms, other_ms, task_relevance_score FROM sessions;"

# Sessions テーブル（全カラム）
sqlite3 /Users/KK/work/ih13/SK32/focus-eye/data/focus-eye.db \
  ".mode column" ".headers on" \
  "SELECT * FROM sessions;"

# Settings テーブル
sqlite3 /Users/KK/work/ih13/SK32/focus-eye/data/focus-eye.db \
  ".mode column" ".headers on" \
  "SELECT * FROM settings;"

# レコード数を確認
sqlite3 /Users/KK/work/ih13/SK32/focus-eye/data/focus-eye.db \
  "SELECT 'goals' as table_name, COUNT(*) as count FROM goals UNION ALL SELECT 'sessions', COUNT(*) FROM sessions UNION ALL SELECT 'settings', COUNT(*) FROM settings;"

# 特定の goal に紐付く sessions を確認
sqlite3 /Users/KK/work/ih13/SK32/focus-eye/data/focus-eye.db \
  ".mode column" ".headers on" \
  "SELECT s.id, s.goal_id, s.task_title, s.duration_ms, g.title as goal_title FROM sessions s LEFT JOIN goals g ON s.goal_id = g.id ORDER BY s.id DESC LIMIT 10;"

# 今週のセッション統計
sqlite3 /Users/KK/work/ih13/SK32/focus-eye/data/focus-eye.db \
  ".mode column" ".headers on" \
  "SELECT COUNT(*) as session_count, SUM(duration_ms) as total_time_ms, AVG(task_relevance_score) as avg_focus_score FROM sessions WHERE start_time >= datetime('now', 'weekday 0', '-7 days');"
