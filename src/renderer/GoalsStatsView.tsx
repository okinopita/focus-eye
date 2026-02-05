/**
 * ゴール統計表示コンポーネント
 */
import React from "react";
import type { Goal } from "../common/types";

interface GoalsStatsViewProps {
  goals: Goal[];
  onCreateGoal: () => void;
}

export default function GoalsStatsView({ goals, onCreateGoal }: GoalsStatsViewProps) {
  const [goalProgress, setGoalProgress] = React.useState<Record<number, number>>({});

  // 全ゴールの実際のセッション時間を取得
  React.useEffect(() => {
    const fetchProgress = async () => {
      const progressMap: Record<number, number> = {};
      
      for (const goal of goals) {
        try {
          const result = await (window as any).electronAPI.getTotalTimeByGoal(goal.id);
          if (result.success) {
            progressMap[goal.id] = result.totalTime || 0;
          }
        } catch (error) {
          console.error(`Failed to fetch progress for goal ${goal.id}:`, error);
          progressMap[goal.id] = 0;
        }
      }
      
      setGoalProgress(progressMap);
    };

    if (goals.length > 0) {
      fetchProgress();
    }
  }, [goals]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
  };

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}時間${minutes > 0 ? minutes + "分" : ""}`;
    }
    return `${minutes}分`;
  };

  const calculateProgress = (goal: Goal, actualMs: number = 0) => {
    return Math.min((actualMs / goal.target_time_ms) * 100, 100);
  };

  const isExpired = (goal: Goal) => {
    return Date.now() > goal.end_date;
  };

  const daysRemaining = (goal: Goal) => {
    const remaining = Math.ceil((goal.end_date - Date.now()) / (1000 * 60 * 60 * 24));
    return Math.max(0, remaining);
  };

  // ゴールをソート: 有効なものを最初に、その後 start_date の降順
  const sortedGoals = [...goals].sort((a, b) => {
    if (a.is_active !== b.is_active) {
      return a.is_active ? -1 : 1;
    }
    return b.start_date - a.start_date;
  });

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-white">ゴール統計</h2>
          <p className="text-slate-400 mt-1">あなたのゴール達成状況を確認</p>
        </div>
        <button
          onClick={onCreateGoal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition"
        >
          + 新規ゴール
        </button>
      </div>

      {/* ゴールリスト */}
      {sortedGoals.length === 0 ? (
        <div className="bg-slate-700 rounded-lg p-12 text-center">
          <div className="text-slate-400 text-lg mb-4">まだGoalが作成されていません</div>
          <button
            onClick={onCreateGoal}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition"
          >
            最初のGoalを作成
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedGoals.map((goal) => {
            const actualTime = goalProgress[goal.id] || 0;
            const progress = calculateProgress(goal, actualTime);
            const expired = isExpired(goal);
            const remaining = daysRemaining(goal);

            return (
              <div
                key={goal.id}
                className={`bg-slate-700 rounded-lg p-6 ${
                  !goal.is_active ? "opacity-60" : ""
                }`}
              >
                {/* ゴールヘッダー */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">{goal.title}</h3>
                    <div className="flex gap-4 text-sm text-slate-400">
                      <span>📅 {formatDate(goal.start_date)} ~ {formatDate(goal.end_date)}</span>
                      {!expired && goal.is_active && (
                        <span className="text-blue-400">⏰ 残り{remaining}日</span>
                      )}
                      {expired && (
                        <span className="text-red-400">⏰ 期限切れ</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {goal.is_active ? (
                      <span className="px-3 py-1 bg-green-900 text-green-300 text-xs font-bold rounded-full">
                        Active
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-slate-600 text-slate-400 text-xs font-bold rounded-full">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>

                {/* プログレスバー */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-300">進捗</span>
                    <span className="text-slate-300">
                      {formatDuration(actualTime)} / {formatDuration(goal.target_time_ms)}
                    </span>
                  </div>
                  <div className="h-3 bg-slate-600 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        progress >= 100
                          ? "bg-gradient-to-r from-green-500 to-emerald-500"
                          : progress >= 50
                          ? "bg-gradient-to-r from-blue-500 to-cyan-500"
                          : "bg-gradient-to-r from-orange-500 to-yellow-500"
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>0%</span>
                    <span className="font-bold text-slate-300">{progress.toFixed(1)}%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* 統計情報グリッド */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-600 rounded p-3">
                    <div className="text-xs text-slate-400 mb-1">目標時間</div>
                    <div className="text-lg font-bold text-white">
                      {formatDuration(goal.target_time_ms)}
                    </div>
                  </div>
                  <div className="bg-slate-600 rounded p-3">
                    <div className="text-xs text-slate-400 mb-1">実績時間</div>
                    <div className="text-lg font-bold text-white">
                      {formatDuration(actualTime)}
                    </div>
                  </div>
                  <div className="bg-slate-600 rounded p-3">
                    <div className="text-xs text-slate-400 mb-1">達成率</div>
                    <div className={`text-lg font-bold ${
                      progress >= 100 ? "text-green-400" : "text-white"
                    }`}>
                      {progress.toFixed(0)}%
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
