// NSWorkspace.shared.frontmostApplication - ビルド済み macOS バイナリ + AppleScript を使用

import os from "os";
import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { getActiveBrowserTabTitleMac } from "./getBrowserTabTitleMac.js";


// ESM (import.meta.url) と CommonJS (__dirname) の両方の実行時でディレクトリを解決
let __dirnamePath: string;
try {
  // ESM環境
  __dirnamePath = path.dirname(fileURLToPath(import.meta.url));
} catch (e) {
  // CommonJSのフォールバック
  // @ts-ignore
  __dirnamePath = __dirname;
}

const platform = os.platform();

/**
 * Windows実装
 */
function windowsApi() {
  console.log("windowsApi は開発中です!");
  
  // // --- GetForegroundWindow ---
  // const user32 = ffi.Library("user32", {
  //   GetForegroundWindow: ["int32", []],
  //   GetWindowThreadProcessId: ["uint32", ["int32", "uint32*"]],
  // });

  // // --- GetLastInputInfo ---
  // const LASTINPUTINFO = StructType({
  //   cbSize: "uint32",
  //   dwTime: "uint32",
  // });

  // const kernel32 = ffi.Library("kernel32", {
  //   GetTickCount: ["uint32", []],
  // });

  // const user32Extra = ffi.Library("user32", {
  //   GetLastInputInfo: ["int", [ref.refType(LASTINPUTINFO)]],
  // });

  // function getForegroundApp(): number {
  //   const hwnd = user32.GetForegroundWindow();
  //   const pidBuf = ref.alloc("uint32");
  //   user32.GetWindowThreadProcessId(hwnd, pidBuf);
  //   return pidBuf.deref(); // プロセスID
  // }

  // function getIdleTime(): number {
  //   const info = new LASTINPUTINFO();
  //   info.cbSize = LASTINPUTINFO.size;
  //   user32Extra.GetLastInputInfo(info.ref());
  //   const tickCount = kernel32.GetTickCount();
  //   return (tickCount - info.dwTime) / 1000; // 秒
  // }

  // return { getForegroundApp, getIdleTime };
}

export let useAutomation = false;
export function setUseAutomation(v: boolean) { useAutomation = v; }

/**
 * macOS実装
 */
function macApi() {
  // 同じフォルダのバイナリとしてコンパイルされた小さなObjective-Cヘルパーを使用。
  // ヘルパーは最前面のアプリケーション情報をJSON形式で標準出力に出力。

  // trueの場合、AppleScriptヘルパーを呼び出してアクティブブラウザタブタイトルを取得（自動化権限が必要）。

  type ForegroundInfo = {
    appDisplayName: string;
    appExecutable: string;
    // browsing はオプション; 自動化が有効かつ利用可能な場合のみ設定される
    browsing?: string;
  };

  async function getForegroundApp(): Promise<ForegroundInfo | string> {
    try {
      // console.log("[getForegroundApp] platform:", platform);
      // console.log("[getForegroundApp] __dirnamePath:", __dirnamePath);
      
      // dist と src の両方のパスをチェック
      let bin = path.join(__dirnamePath, "get_frontmost_app");
      // console.log("[getForegroundApp] binary path (dist):", bin);
      
      if (!fs.existsSync(bin)) {
        // dist から実行時に src パスにフォールバック
        const srcPath = path.join(__dirnamePath, "..", "..", "src", "native", "get_frontmost_app");
        // console.log("[getForegroundApp] binary path (src fallback):", srcPath);
        if (fs.existsSync(srcPath)) {
          bin = srcPath;
        }
      }
      
      // console.log("[getForegroundApp] binary exists:", fs.existsSync(bin));
      
      if (!fs.existsSync(bin)) {
        const msg = "NotImplemented(macOS requires ObjC bridge — build sample_codes/build_native.sh)";
        // console.error("[getForegroundApp] ERROR:", msg);
        return msg;
      }
      
      // console.log("[getForegroundApp] executing binary...");
      const out = execFileSync(bin, { encoding: "utf8" }).toString().trim();
      // console.log("[getForegroundApp] binary output:", out);
      
      if (!out) {
        console.warn("[getForegroundApp] empty output, returning default");
        return { appDisplayName: "", appExecutable: "", browsing: "" };
      }
      
      try {
        const parsed = JSON.parse(out) as ForegroundInfo;
        console.log("[getForegroundApp] パース済み JSON:", parsed);
        // 有効な場合のみ、オプションでブラウジング情報を取得
        let browsing = "";
        if (useAutomation) {
          try {
            browsing = await getActiveBrowserTabTitleMac(parsed.appDisplayName);
          } catch (inner) {
            browsing = "";
          }
        }
        // フィールドが存在することを確認
        return {
          appDisplayName: parsed.appDisplayName || "",
          appExecutable: parsed.appExecutable || "",
          ...(browsing ? { browsing } : {}),
        };
      } catch (e) {
        // フォールバック: タブ区切りフォールバック形式
        // console.log("[getForegroundApp] JSON parse failed, trying tab-separated format");
        const parts = out.split('\t');
        let browsing = "";
        if (useAutomation) {
          try {
            browsing = await getActiveBrowserTabTitleMac(parts[0]);
          } catch (inner) {
            browsing = "";
          }
        }

        return {
          appDisplayName: parts[0] || "",
          appExecutable: parts[1] || "",
          ...(browsing ? { browsing } : {}),
        };
      }
    } catch (err: any) {
      const errorMsg = err && err.message ? err.message : String(err);
      console.error("[getForegroundApp] EXCEPTION:", errorMsg, err);
      return `Error(getForegroundApp): ${errorMsg}`;
    }
  }

  function getIdleTime(): number {
    // ioreg を使用してナノ秒単位でHIDIdleTimeを取得
    try {
      const out = execFileSync("ioreg", ["-c", "IOHIDSystem"], { encoding: "utf8" });
      const m = out.match(/HIDIdleTime[^0-9]*([0-9]+)/);
      if (m && m[1]) {
        const nanos = Number(m[1]);
        if (!Number.isNaN(nanos)) {
          return nanos / 1e9; // 秒に変換
        }
      }
      throw new Error("HIDIdleTime not found in ioreg output");
    } catch (e: any) {
      console.error(`getIdleTime fallback failed: ${e.message}`);
      return 0; // フォールバック: アイドルでないと想定
    }
  }

  return { getForegroundApp, getIdleTime };
}

// エクスポート: 実行環境に応じて切り替え
export const systemUtils =
  platform === "win32" ? windowsApi() : platform === "darwin" ? macApi() : null;
