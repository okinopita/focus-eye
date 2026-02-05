// AppleScript ヘルパーでアクティブブラウザタブタイトルを取得
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// ブラウザからアクティブタブタイトルを取得するための AppleScript スニペット
const appleScriptCommands: Record<string, string> = {
  Safari: `tell application "Safari" to get name of current tab of front window`,
  "Google Chrome": `tell application "Google Chrome" to get title of active tab of front window`,
  "Microsoft Edge": `tell application "Microsoft Edge" to get title of active tab of front window`,
  Firefox: `tell application "Firefox" to get (execute javascript "document.title" in (current tab of current window))`,
};

/**
 * AppleScript 経由でアクティブブラウザタブタイトルを取得 (macOS のみ)。
 * @param appName ブラウザアプリケーション名 (e.g., "Google Chrome", "Safari")
 * @returns Promise<string> アクティブタブタイトル、または利用不可的な場合は空文字列
 */
export async function getActiveBrowserTabTitleMac(appName: string): Promise<string> {
  const script = appleScriptCommands[appName];
  if (!script) {
    console.log("不明なブラウザ");
    
    return ""; // 既知のブラウザではない
  }
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 2000,
      encoding: "utf8",
    });
    console.log("ブラウザタイトル: " + stdout.trim());
    
    return stdout.trim();
  } catch (e) {
    console.log("エラー: " + e);

    // AppleScript 実行失敗またはタイムアウト
    return "";
  }
}
