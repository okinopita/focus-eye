-- JavaScript学習ゴール作成（2026/1/25 ~ 2026/1/31、目標10時間）
INSERT INTO goals (title, target_time_ms, start_date, end_date, is_active, created_at)
VALUES ('JavaScript学習', 36000000, 1737734400000, 1738339199000, 0, 1737734400000);

-- セッション1: 2026/1/26 10:00-13:00 (3時間)
INSERT INTO sessions (
  goal_id, task_title, task_intent, start_time, end_time, duration_ms,
  work_ms, communication_ms, game_ms, entertainment_ms, browser_ms, other_ms,
  task_relevance_score, task_relevant_time_ms, task_irrelevant_time_ms,
  browser_automation_enabled, is_demo, created_at
)
VALUES (
  last_insert_rowid(),
  'JavaScript学習',
  'ES6の新機能を学ぶ',
  1737856800000,
  1737867600000,
  10800000,
  9720000, 0, 0, 540000, 540000, 0,
  0.9, 9720000, 1080000, 0, 0, 1737867600000
);

-- セッション2: 2026/1/27 14:00-17:30 (3.5時間)
INSERT INTO sessions (
  goal_id, task_title, task_intent, start_time, end_time, duration_ms,
  work_ms, communication_ms, game_ms, entertainment_ms, browser_ms, other_ms,
  task_relevance_score, task_relevant_time_ms, task_irrelevant_time_ms,
  browser_automation_enabled, is_demo, created_at
)
SELECT 
  id, 'JavaScript学習', 'Reactの基礎を学ぶ',
  1737954000000, 1737966600000, 12600000,
  11340000, 630000, 0, 315000, 315000, 0,
  0.85, 10710000, 1890000, 0, 0, 1737966600000
FROM goals WHERE title = 'JavaScript学習';

-- セッション3: 2026/1/29 09:00-10:30 (1.5時間)
INSERT INTO sessions (
  goal_id, task_title, task_intent, start_time, end_time, duration_ms,
  work_ms, communication_ms, game_ms, entertainment_ms, browser_ms, other_ms,
  task_relevance_score, task_relevant_time_ms, task_irrelevant_time_ms,
  browser_automation_enabled, is_demo, created_at
)
SELECT 
  id, 'JavaScript学習', '非同期処理とPromiseを学ぶ',
  1738112400000, 1738117800000, 5400000,
  4860000, 270000, 0, 135000, 135000, 0,
  0.9, 4860000, 540000, 0, 0, 1738117800000
FROM goals WHERE title = 'JavaScript学習';

-- 確認
SELECT '=== Goal Information ===' as section;
SELECT 
  id,
  title,
  target_time_ms / 3600000.0 as target_hours,
  datetime(start_date/1000, 'unixepoch', 'localtime') as start_date,
  datetime(end_date/1000, 'unixepoch', 'localtime') as end_date,
  is_active
FROM goals WHERE title = 'JavaScript学習';

SELECT '=== Sessions ===' as section;
SELECT 
  id,
  task_title,
  task_intent,
  duration_ms / 3600000.0 as duration_hours,
  datetime(start_time/1000, 'unixepoch', 'localtime') as session_time
FROM sessions 
WHERE goal_id = (SELECT id FROM goals WHERE title = 'JavaScript学習')
ORDER BY start_time;

SELECT '=== Achievement ===' as section;
SELECT 
  g.title,
  g.target_time_ms / 3600000.0 as target_hours,
  SUM(s.duration_ms) / 3600000.0 as actual_hours,
  ROUND(SUM(s.duration_ms) * 100.0 / g.target_time_ms, 1) as achievement_percent
FROM goals g
LEFT JOIN sessions s ON g.id = s.goal_id
WHERE g.title = 'JavaScript学習'
GROUP BY g.id;
