// NSWorkspace.shared.frontmostApplication - using pre-built macOS binary + AppleScript

import os from "os";
import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { getActiveBrowserTabTitleMac } from "./getBrowserTabTitleMac.js";


// Resolve directory in both ESM (import.meta.url) and CommonJS (__dirname) runtimes.
let __dirnamePath: string;
try {
  // ESM environment
  __dirnamePath = path.dirname(fileURLToPath(import.meta.url));
} catch (e) {
  // Fallback for CommonJS
  // @ts-ignore
  __dirnamePath = __dirname;
}

const platform = os.platform();

/**
 * Windows実装
 */
function windowsApi() {
  console.log("windowsApi is on working in progress!");
  
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
  // using a small Objective-C helper compiled as a binary in the same folder.
  // The helper prints the frontmost application's info as JSON to stdout.

  // If true, call AppleScript helper to get active browser tab title (requires Automation permission).

  type ForegroundInfo = {
    appDisplayName: string;
    appExecutable: string;
    // browsing is optional; only populated when automation is enabled and available
    browsing?: string;
  };

  async function getForegroundApp(): Promise<ForegroundInfo | string> {
    try {
      // console.log("[getForegroundApp] platform:", platform);
      // console.log("[getForegroundApp] __dirnamePath:", __dirnamePath);
      
      // Check both dist and src paths
      let bin = path.join(__dirnamePath, "get_frontmost_app");
      // console.log("[getForegroundApp] binary path (dist):", bin);
      
      if (!fs.existsSync(bin)) {
        // Fallback to src path when running from dist
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
        console.log("[getForegroundApp] parsed JSON:", parsed);
        // optionally attempt to get browsing info only when enabled
        let browsing = "";
        if (useAutomation) {
          try {
            browsing = await getActiveBrowserTabTitleMac(parsed.appDisplayName);
          } catch (inner) {
            browsing = "";
          }
        }
        // ensure fields exist
        return {
          appDisplayName: parsed.appDisplayName || "",
          appExecutable: parsed.appExecutable || "",
          ...(browsing ? { browsing } : {}),
        };
      } catch (e) {
        // fallback: tab-separated fallback format
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
    // Use ioreg to get HIDIdleTime in nanoseconds
    try {
      const out = execFileSync("ioreg", ["-c", "IOHIDSystem"], { encoding: "utf8" });
      const m = out.match(/HIDIdleTime[^0-9]*([0-9]+)/);
      if (m && m[1]) {
        const nanos = Number(m[1]);
        if (!Number.isNaN(nanos)) {
          return nanos / 1e9; // convert to seconds
        }
      }
      throw new Error("HIDIdleTime not found in ioreg output");
    } catch (e: any) {
      console.error(`getIdleTime fallback failed: ${e.message}`);
      return 0; // fallback: assume not idle
    }
  }

  return { getForegroundApp, getIdleTime };
}

// エクスポート: 実行環境に応じて切り替え
export const systemUtils =
  platform === "win32" ? windowsApi() : platform === "darwin" ? macApi() : null;
