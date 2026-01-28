# Focus eye - AI 統合設定ガイド

## 概要

Focus eye は AWS Bedrock の Amazon Nova 2 Lite モデルを用いて、セッション終了時に自動的に集中度と生産性を評価します。

## ファイル構成

```
src/ai/
  ├── system_prompt.md      # AI の出力制御ルール（Amazon Nova 2 Lite の system role に送信）
  ├── types.ts              # 入出力スキーマの TypeScript 型定義
  └── client.ts             # AWS API クライアント実装
```

## セットアップ

### 1. AWS 認証情報の設定

環境変数で AWS 認証情報を設定してください：

```bash
export AWS_REGION=us-east-1                    # または ap-northeast-1
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
```

または `.env` ファイル（git 管理外）で設定：

```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

### 2. AWS Bedrock のセットアップ

1. [AWS Management Console](https://console.aws.amazon.com/) にログイン
2. Bedrock → Model access から Claude 3 Sonnet を有効化
3. API キーの権限を確認（`bedrock:InvokeModel` 権限が必要）

## ワークフロー

### セッション実行フロー

```
1. UI で [Session Start] ボタン
   ↓
2. Main プロセスで 5 秒ごとにアプリログを収集
   ↓
3. セッション終了時に以下を実行：
   - appLogs から使用時間を集計
   - AISessionInput を構築
   ↓
4. AWS Bedrock Claude に送信：
   - system_prompt.md の内容
   - AISessionInput（JSON）
   ↓
5. Claude が AISessionOutput (JSON) を返却
   ↓
6. 結果を Renderer に送信（React で表示）
```

### AI への入力例

```json
{
  "task": "Electronアプリのログ機能実装",
  "session": {
    "duration_minutes": 90,
    "appLogs": [
      { "name": "Visual Studio Code", "category": "WORK", "time": 55 },
      { "name": "Google Chrome", "category": "BROWSER", "time": 20 },
      { "name": "Discord", "category": "COMMUNICATION", "time": 5 },
      { "name": "Safari", "category": "BROWSER", "time": 10 }
    ],
    "afk_minutes": 0
  }
}
```

### AI からの出力例

```json
{
  "summary": "Strong focus on development with minimal distractions.",
  "focus_score": 0.82,
  "concentration_quality": "HIGH",
  "app_distribution": {
    "productive": 61,
    "communication": 6,
    "distraction": 0,
    "other": 33
  },
  "distraction_notes": "Browser usage likely related to documentation/research.",
  "highlights": [
    "55 minutes of uninterrupted development time",
    "Effective context switching with research"
  ],
  "recommendations": [
    "Consider time-boxing research tasks",
    "Aim for 75+ minutes of uninterrupted development"
  ]
}
```

## System Prompt の役割

[system_prompt.md](./system_prompt.md) は以下を定義します：

1. **AI の役割**: 生産性評価アシスタント
2. **入力フォーマット**: 期待される JSON スキーマ
3. **出力フォーマット**: 返却すべき JSON スキーマ
4. **計算ルール**: focus_score の算出方法
5. **出力制約**: JSON のみ、マークダウン不可

**重要**: `src/ai/client.ts` と `src/ai/types.ts` のスキーマが system_prompt.md と**完全に一致していることを確認**してください。

## 実装コード例（Renderer 側）

React UI でタスク名を入力し、AI 評価結果を表示：

```typescript
const handleStartSession = async () => {
  const response = await window.electronAPI.startSession({
    sessionTimeMs: sessionSeconds * 1000,
    taskName: taskName,  // ← タスク名を指定
    enableAutomation: enableAutomation,
  });

  if (response.success && response.result) {
    setResult(response.result);
    // response.result.aiEvaluation で評価結果を取得
  }
};
```

## デバッグ

### ログ確認

Electron DevTools（Cmd+Option+I）の Console タブで以下のログを確認：

```
[AI] Building Bedrock request...
[AI] AWS API call would be made here
[AI] AI evaluation received: { ... }
```

### モック評価（AWS なし）

AWS 認証情報が未設定の場合、自動的に `getMockEvaluation()` が使用されます：

```bash
# AWS なしで実行（モック評価を返す）
npm start
```

## トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|-------|
| "AWS credentials not configured" | 環境変数が未設定 | AWS_REGION 等を設定 |
| JSON parse error | Claude が不正な JSON を返した | system_prompt.md の制約を確認 |
| "Invalid focus_score" | focus_score が 0-1 範囲外 | AI クライアントのバリデーション確認 |

## API コスト見積もり

AWS Bedrock Claude 3 Sonnet の料金（2024年）：
- 入力: $0.003 / 1K トークン
- 出力: $0.015 / 1K トークン

**90 分セッション 1 回あたり**：
- 平均入力: ~200 トークン = $0.0006
- 平均出力: ~300 トークン = $0.0045
- **合計: 約 $0.005 / セッション**

## 今後の拡張

- [ ] AI 評価結果をローカル DB (SQLite) に保存
- [ ] セッション履歴の集計で月間レポート生成
- [ ] ユーザーフィードバック（良い/悪い）で AI プロンプト最適化
- [ ] 複数の AI モデル（GPT-4, Gemini など）の対応
- [ ] リアルタイムアラート（集中度が低下した時点で通知）
