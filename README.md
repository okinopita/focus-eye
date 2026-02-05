# FocusEye

**macOSでのみ動作します。**

Electronベースのデスクトップ向け「集中支援」ツール。ユーザーが作業開始前にタスクを宣言し、作業中に最前面アプリや無操作時間を記録、作業終了時にAIが集中度メトリクスを生成します。

## 特長

- **作業セッション管理**: セッション開始／終了でタイムスタンプを保存
- **最前面アプリ取得**: 5秒ごとにフォアグラウンドアプリ名とブラウザタブタイトルを記録
- **アプリ分類**: WORK(作業), GAME, ENTERTAINMENT等のカテゴリに自動分類
- **使用率可視化**: Category別・App別の使用時間と割合をリアルタイム表示
- **ローカル永続化**: SQLiteでタスク・セッション・ログ・要約を保存
- **AI要約**: AWS Bedrock (Nova) による作業セッションの評価と要約生成

## 要件

- macOS（M1/M2/Intel対応）
- pnpm
- Node.js 18+

## セットアップ

### 1. 依存関係のインストール

```bash
pnpm install
```

### 2. 環境変数の設定

`.env` ファイルを作成し、AWS認証情報を入力：

```bash
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region
```

## 使い方

### 本番実行（推奨）

```bash
npm start
```

### 開発実行（ライブリロード対応）

concurrentlyで一括起動：

```bash
npm run dev
```

デバッグコンソールが自動で開き、リアルタイムでログが表示されます。

### ビルド

```bash
# TypeScript コンパイル + Vite ビルド
pnpm run build

# ビルド結果
dist/
  main/
    index.js
  renderer/
    index.html
    index.*.js
```

### アプリケーションの使い方

1. 「Session Duration (seconds)」に秒数を入力（デフォルト 50秒）
2. 「Enable Automation」をチェック（AppleScript でブラウザタブタイトルも取得したい場合）
3. 「[Session Start]」ボタンを押す
4. セッション実行中、バックグラウンドで最前面アプリを定期的に取得
5. セッション終了時、画面に「Usage by Category」「Usage by Application」が表示


## プロジェクト構成

```
src/
  main/
    index.ts        # Electron メインプロセス（IPC ハンドラ）
    preload.ts      # IPC ブリッジ
  renderer/
    App.tsx         # React UI（メインコンポーネント）
    GoalsStatsView.tsx  # 目標・統計表示コンポーネント
    index.tsx       # エントリポイント
    index.html      # HTML
    index.css       # Tailwind CSS
  native/
    getForegroundApp.ts        # OS API ラッパー（macOS/Windows）
    getBrowserTabTitleMac.ts   # AppleScript (macOS only)
    main_session.ts            # CLI テスト用
    get_frontmost_app          # macOS ネイティブバイナリ
    build_native.sh            # バイナリビルドスクリプト
  common/
    types.ts        # 共通型定義
    analytics.ts    # アプリ分類・使用率計算
  db/
    database.ts     # SQLite データベース管理
    repositories.ts # データアクセス層
    schema.sql      # テーブル定義
  ai/
    client.ts       # AWS Bedrock クライアント
    types.ts        # AI関連型定義
    system_prompt.md  # AIプロンプト
```

## 参考ファイル

- [ARCHITECTURE.md](ARCHITECTURE.md) - アーキテクチャ設計
- [.github/copilot-instructions.md](.github/copilot-instructions.md) - 開発ガイドライン
- [src/ai/README.md](src/ai/README.md) - AI機能の詳細

## ライセンス

MIT
