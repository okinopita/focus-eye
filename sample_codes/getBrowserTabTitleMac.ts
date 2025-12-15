// AppleScript helper to get active browser tab title
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// AppleScript snippets for getting active tab titles from browsers
const appleScriptCommands: Record<string, string> = {
  Safari: `tell application "Safari" to get name of current tab of front window`,
  "Google Chrome": `tell application "Google Chrome" to get title of active tab of front window`,
  "Microsoft Edge": `tell application "Microsoft Edge" to get title of active tab of front window`,
  Firefox: `tell application "Firefox" to get (execute javascript "document.title" in (current tab of current window))`,
};

/**
 * Get active browser tab title via AppleScript (macOS only).
 * @param appName The browser application name (e.g., "Google Chrome", "Safari")
 * @returns Promise<string> The active tab title, or empty string if not available
 */
export async function getActiveBrowserTabTitleMac(appName: string): Promise<string> {
  const script = appleScriptCommands[appName];
  if (!script) {
    console.log("unknown browser");
    
    return ""; // Not a known browser
  }
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 2000,
      encoding: "utf8",
    });
    console.log("stdout from browsertabtitle " + stdout.trim());
    
    return stdout.trim();
  } catch (e) {
    console.log("error: " + e);

    // AppleScript execution failed or timed out
    return "";
  }
}
