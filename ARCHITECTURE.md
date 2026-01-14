# Focus Share - アーキテクチャ解説

このドキュメントは、Electron アプリの構成と各ファイルの役割を詳細に説明します。

---

## 全体フロー

```
User Click [Session Start]
    ↓
React (src/renderer/App.tsx)
    ↓
Preload Bridge (src/main/preload.ts)
    ↓
IPC Handler (src/main/index.ts)
    ↓
systemUtils.getForegroundApp() (src/native/getForegroundApp.ts)
    ↓ (5秒ごと × N回)
AppLogs 収集
    ↓
calculateUsageSummary() (src/common/analytics.ts)
    ↓
結果を React に返却
    ↓
UI表示 (src/renderer/App.tsx)
```

---

## ファイル構成と役割

### 1. Renderer (UI層)

#### `src/renderer/App.tsx`
- **役割**: React UI コンポーネント
- **機能**:
  - セッション時間、Automation フラグの入力フォーム
  - `[Session Start]` ボタン
  - 結果表示（Category 別使用時間、App 別使用時間）
- **通信方法**: `window.electronAPI.startSession()` 経由で IPC 呼び出し
- **型定義**: `global.Window.electronAPI` で TypeScript 型安全性を確保

#### `src/renderer/index.tsx`
- React のエントリポイント
- React DOM で `#root` div にマウント

#### `src/renderer/index.html`
- HTML テンプレート
- `<div id="root"></div>` に React がレンダリングされる
- Vite によって最適化された CSS・JS が読み込まれる

---

### 2. Main Process (Electron メインプロセス)

#### `src/main/index.ts`
- **役割**: Electron メインプロセス
- **主な処理**:
  1. `createWindow()`: BrowserWindow を作成、UI を読み込み
  2. IPC ハンドラ `session:start`: セッション実行ロジック
- **IPC ハンドラの流れ**:
  ```typescript
  // 1. 入力検証
  if (!systemUtils) { return error; }
  
  // 2. App ログ収集ループ
  while (elapsed < sessionTimeMs) {
    const fg = await systemUtils.getForegroundApp();
    if (typeof fg === "object") {
      const category = categorizeApp(...);
      appLogs.push({ timestamp, appDisplayName, category, ... });
    }
    await sleep(5000); // 5秒待機
  }
  
  // 3. 集計計算
  const { appSummary, categorySummary } = calculateUsageSummary(appLogs);
  
  // 4. 結果を React に返却
  return { success: true, result };
  ```

#### `src/main/preload.ts`
- **役割**: IPC ブリッジ（Renderer ↔ Main プロセスの通信仲介）
- **重要**: CommonJS 形式（`require`）で記述される必要がある
  - Electron preload スクリプトは ES6 modules をサポートしていない
  - TypeScript では CommonJS 記法 `require()` を使用
- **exposeInMainWorld**: `window.electronAPI` にメソッドを公開
  ```typescript
  contextBridge.exposeInMainWorld("electronAPI", {
    startSession: (req) => ipcRenderer.invoke("session:start", req),
  });
  ```

---

### 3. Native (OS API層)

#### `src/native/getForegroundApp.ts`
- **役割**: OS ネイティブ API へのアクセス
- **macOS 実装**:
  - `get_frontmost_app` バイナリを呼び出し（NSWorkspace.shared.frontmostApplication）
  - オプション: AppleScript で ブラウザタブタイトルを取得（Automation）
- **返り値**:
  ```typescript
  {
    appDisplayName: string;    // e.g., "Google Chrome"
    appExecutable: string;     // e.g., "google-chrome"
    browsing?: string;         // e.g., "YouTube - Google Chrome"（Automation有効時）
  }
  ```
- **exports**:
  - `systemUtils`: プラットフォーム別実装（macOS/Windows）
  - `useAutomation`: Automation 有効フラグ
  - `setUseAutomation()`: フラグを切り替える関数

#### `src/native/getBrowserTabTitleMac.ts`
- **役割**: AppleScript でブラウザタブタイトルを取得（macOS 専用）
- **対応ブラウザ**: Safari, Chrome, Edge, Firefox
- **権限**: Automation の許可が必要（ユーザーに許可ダイアログが表示される）

#### `src/native/get_frontmost_app` (コンパイル済みバイナリ)
- **役割**: macOS ネイティブ実行ファイル
- **動作**: `NSWorkspace.shared.frontmostApplication` を呼び出し、アプリ情報を JSON で出力
- **再ビルド**:
  ```bash
  bash src/native/build_native.sh
  ```

---

### 4. Common (共通ユーティリティ)

#### `src/common/types.ts`
- **役割**: 型定義
- **定義内容**:
  ```typescript
  type AppCategory = "WORK" | "BROWSER" | "COMMUNICATION" | "GAME" | "ENTERTAINMENT" | "OTHER";
  
  interface AppLog {
    timestamp: number;
    appDisplayName: string;
    appExecutable: string;
    browsing?: string;
    category: AppCategory;
  }
  
  interface SessionResult {
    startTime: number;
    endTime: number;
    durationMs: number;
    appLogs: AppLog[];
    usageSummary: Record<string, number>;        // App名 → 使用時間(ms)
    categoryUsageSummary: Record<AppCategory, number>;  // Category → 使用時間(ms)
  }
  ```

#### `src/common/analytics.ts`
- **役割**: アプリ分類と使用時間計算
- **主要関数**:

##### `categorizeApp(appDisplayName, appExecutable, browsing): AppCategory`
- **入力**: アプリ名、実行ファイル名、ブラウザコンテンツ
- **出力**: カテゴリ判定（WORK, BROWSER, GAME, ENTERTAINMENT, OTHER）
- **判定ロジック**:
  ```typescript
  // 優先度順
  if (exec.includes("steam")) return "GAME";        // 実行ファイル名で判定
  if (name.includes("vscode")) return "WORK";       // 表示名で判定
  if (browse.includes("youtube")) return "ENTERTAINMENT";  // ブラウザコンテンツで判定
  ```

##### `calculateUsageSummary(appLogs): { appSummary, categorySummary }`
- **入力**: アプリログの配列（timestamp と category を含む）
- **出力**: 
  - `appSummary`: アプリ名ごとの使用時間集計（ms 単位）
  - `categorySummary`: カテゴリごとの使用時間集計（ms 単位）
- **計算ロジック**:
  1. ログを timestamp でソート
  2. 連続する 2 つのログの時間差を計算 → そのアプリの使用時間とする
  3. アプリ/カテゴリ別に累積
  4. 最後のログには 5 秒のデフォルト時間を付与

---

## IPC 通信フロー

### React → Main プロセス

```typescript
// src/renderer/App.tsx
const response = await window.electronAPI.startSession({
  sessionTimeMs: 30000,       // 30秒
  enableAutomation: false,
});
```

↓ preload.ts で IPC に変換 ↓

```typescript
// src/main/preload.ts
ipcRenderer.invoke("session:start", req)
```

↓ Main プロセスで処理 ↓

```typescript
// src/main/index.ts
ipcMain.handle("session:start", async (event, req) => {
  // ... ロジック ...
  return { success: true, result };
});
```

↓ 結果を React に返却 ↓

```typescript
// src/renderer/App.tsx
if (response.success && response.result) {
  setResult(response.result);  // UI に結果を表示
}
```

---

## ビルド・実行フロー

### ビルド時

```
npm run build
    ↓
TypeScript コンパイル (tsc)
    ↓
dist/main/*.js
dist/common/*.js
dist/native/*.js
    ↓
Vite ビルド (src/renderer → React SPA)
    ↓
dist/renderer/index.html
dist/renderer/assets/*.js
dist/renderer/assets/*.css
```

### 実行時（本番）

```
npm start
    ↓
electron .
    ↓
Electron 起動 → dist/main/index.js 読み込み
    ↓
BrowserWindow 作成 → file:// プロトコルで dist/renderer/index.html 読み込み
    ↓
React UI 表示
```

### 実行時（開発）

**ターミナル 1:**
```bash
npx vite --root src/renderer
    ↓
http://localhost:5173 で Vite dev server 起動
```

**ターミナル 2:**
```bash
NODE_ENV=development npm start
    ↓
Electron 起動
    ↓
BrowserWindow が http://localhost:5173 に接続
    ↓
React UI 表示（ホットリロード対応）
```

---

## デバッグ方法

### Renderer (React) のデバッグ
1. DevTools を開く：`Cmd+Option+I` (macOS) / `Ctrl+Shift+I` (Windows)
2. Console、Sources タブで変数やエラーを確認

### Main プロセスのデバッグ
1. ターミナルで `console.log()` の出力を確認
2. または `NODE_ENV=development npm start` で DevTools を開く

### 例：App ログが空の場合
```typescript
// src/main/index.ts にログを追加
console.log(`[IPC] Collected ${appLogs.length} app logs`);
console.log("[IPC] Sample:", appLogs.slice(0, 2));
```

---

## よくある問題と解決策

| 問題 | 原因 | 解決策 |
|------|------|-------|
| UI が表示されない（dev） | Vite dev server が起動していない | `npx vite --root src/renderer` を別ターミナルで実行 |
| UI が表示されない（prod） | `file://` プロトコルで相対パス失敗 | Vite config に `base: "./"` を設定 |
| "Electron API not available" | preload が ES6 modules のまま | preload.ts を CommonJS (`require`) に修正 |
| App Switches が 0 | appLogs が空、または category が未設定 | categorizeApp() の判定ロジックを確認 |
| Category が空 | calculateUsageSummary() の計算エラー | console.log でログを確認 |

---

## 拡張ポイント

- **SQLite 統合**: 現在はメモリ上に AppLog を保持。DB に永続化する場合は `src/db/` を作成
- **AI 要約**: Azure/AWS LLM API を呼び出す処理を追加
- **タスク管理**: タスク宣言機能を追加
- **Windows 対応**: `src/native/getForegroundApp.ts` の Windows 実装を完成させる
