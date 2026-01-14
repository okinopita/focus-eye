# Focus Share – Electron Demo App

Electron デスクトップアプリで セッション管理とアプリ使用割合の可視化を実装。

## Electron バイナリダウンロード問題

M1/M2 Mac や特定のネットワーク環境では Electron バイナリのダウンロードが失敗することがあります。その場合：

```bash
# 方法1: npm / yarn で再インストール
npm install
npx electron .

# 方法2: Electron のキャッシュをクリア
rm -rf ~/.electron
pnpm install --force

# 方法3: ミラー設定
export ELECTRON_MIRROR=https://cdn.npmmirror.com/mirrors/electron/
pnpm install
npx electron .
```

## セットアップ

### 本番実行（推奨：ビルド済み）  

```bash
npm install
npm start
```

### 開発実行（ライブリロード対応）

**ターミナル 1: Vite dev server を起動**  

```bash
npx vite --root src/renderer
```

出力例：
```
  VITE v5.4.21  ready in 234 ms

  ➜  Local:   http://localhost:5173/
```

**ターミナル 2: Electron アプリを起動（別ターミナル）**  

```bash
NODE_ENV=development npm start
```

デバッグコンソールが自動で開き、リアルタイムでログが表示されます。

## 使い方

1. 「Session Duration (seconds)」に秒数を入力（デフォルト 50秒）
2. 「Enable Automation」をチェック（AppleScript でブラウザタブタイトルも取得したい場合）
3. 「[Session Start]」ボタンを押す
4. セッション実行中、バックグラウンドで最前面アプリを定期的に取得
5. セッション終了時、画面に「Usage by Category」「Usage by Application」が表示

## CLI テスト（Electron 不要）

Electron なしでセッション機能を直接テストする：

```bash
# src/native/main_session.ts を実行
cd /Users/KK/work/ih13/SK32/focus-share
npx ts-node src/native/main_session.ts

# オプション: Automation 有効化
ENABLE_AUTOMATION=1 npx ts-node src/native/main_session.ts
```

## 構成

```
src/
  main/
    index.ts        # Electron メインプロセス（IPC ハンドラ）
    preload.ts      # IPC ブリッジ
  renderer/
    App.tsx         # React UI
    index.tsx       # エントリ
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
```

## 機能

- **Session Start**: ボタン押下で指定秒数のセッション開始
- **App Logging**: 5秒ごとに最前面アプリを記録
- **Automation Mode** (オプション): AppleScript で ブラウザタブタイトルも取得
- **Usage Summary**:  
  - Category 別使用時間（WORK, BROWSER, GAME, ENTERTAINMENT など）
  - App 別使用時間
  - 割合（%）表示

## ビルド

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

## 配布

- macOS アプリとして配布する場合、Info.plist に `NSAppleEventsUsageDescription` を追加
- コード署名と notarize を推奨（詳細は AGENTS.md 参照）
