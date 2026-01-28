/**
 * AI Evaluation API types
 */

/**
 * Input: OTHER カテゴリのアプリのみを AI に送信
 */
export interface AIClassificationInput {
  other_apps: Array<{
    app_name: string;
    seconds: number;
    window_titles_sample: string[];
  }>;
}

/**
 * 分類されたアプリの基本情報
 */
export interface ReclassifiedApp {
  app_name: string;
  new_category: string; // WORK | ENTERTAINMENT | COMMUNICATION | GAME | OTHER
}

/**
 * Output: OTHER / BROWSER アプリの分類結果
 */
export interface AIClassificationOutput {
  reclassified_apps: Array<ReclassifiedApp>;
}

/**
 * AI の分類結果に対して、コード側で追加される関連度スコア
 */
export interface AppWithRelevanceScore extends ReclassifiedApp {
  task_relevance_score: number; // -1.0 (unknown) | 0.0 (unrelated) | 0.5 (neutral) | 1.0 (related)
}

/**
 * Legacy: 古い型（互換性のため保持）
 */
export interface AISessionInput {
  task: string; // タスク宣言（ユーザーが入力した作業内容）
  session: {
    duration_minutes: number;
    appLogs: Array<{
      name: string; // アプリ表示名
      category: "WORK" | "BROWSER" | "COMMUNICATION" | "GAME" | "ENTERTAINMENT" | "OTHER";
      time: number; // 使用時間（分）
    }>;
    afk_minutes: number; // 離席時間（分）
  };
}

export interface AICategoryBreakdownItem {
  category: string; // WORK, ENTERTAINMENT, COMMUNICATION, GAME, OTHER
  minutes: number;
  ratio: number; // 0.0-1.0
}

export interface AIContinuityFeedback {
  summary: string; // 1-2文: 継続性に関する短評
  message: string; // 励ましメッセージ、叱責なし
  badge_hint: string; // UI向けバッジキーワード (e.g., "WEEKLY_FLOW", "COMEBACK", "STEADY")
}

export interface AISessionFeedback {
  summary: string; // 1-2文: 今日の傾向
  detail: string; // 3-4文: 詳しい振り返り
  emoji_reaction: string; // 絵文字1つ (e.g., "🔥", "🏃", "💪")
}

export interface AISessionOutput {
  final_category_breakdown: AICategoryBreakdownItem[];
  continuity_feedback: AIContinuityFeedback;
  session_feedback: AISessionFeedback;
  
  /**
   * Internal field: NOT displayed to users
   * Used internally for message generation and analysis
   * Score 0.0-1.0 indicating productive vs distraction time ratio
   * (Higher = more work time relative to total)
   */
  focus_score?: number;
}

/**
 * AWS Bedrock API リクエスト型（Amazon Nova モデル用）
 */
export interface AWSBedrockRequest {
  modelId: string; 
  system: Array<{
    text: string;
  }>;
  messages: Array<{
    role: "user" | "assistant";
    content: Array<{
      text: string;
    }>;
  }>;
  inferenceConfig?: {
    max_new_tokens?: number;
    temperature?: number; // 0-1
  };
}

export interface AWSBedrockResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}
