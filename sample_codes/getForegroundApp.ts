// NSWorkspace.shared.frontmostApplication node-ffi / N-API

import ffi from "ffi-napi";
import ref from "ref-napi";
import StructType from "ref-struct-napi";
import os from "os";
import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

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

/**
 * macOS実装
 */
function macApi() {
  // using a small Objective-C helper compiled as a binary in the same folder.
  // The helper prints the frontmost application's info as JSON to stdout.

  type ForegroundInfo = {
    appDisplayName: string;
    appExecutable: string;
    browsing: string;
  };

  function getForegroundApp(): ForegroundInfo | string {
    try {
      const bin = path.join(__dirnamePath, "get_frontmost_app");
      if (!fs.existsSync(bin)) {
        return "NotImplemented(macOS requires ObjC bridge — build sample_codes/build_native.sh)";
      }
      const out = execFileSync(bin, { encoding: "utf8" }).toString().trim();
      if (!out) return { appDisplayName: "", appExecutable: "", browsing: "" };
      try {
        const parsed = JSON.parse(out) as ForegroundInfo;
        // ensure fields exist
        return {
          appDisplayName: parsed.appDisplayName || "",
          appExecutable: parsed.appExecutable || "",
          browsing: parsed.browsing || "",
        };
      } catch (e) {
        // fallback: tab-separated fallback format
        const parts = out.split('\t');
        return {
          appDisplayName: parts[0] || "",
          appExecutable: parts[1] || "",
          browsing: parts[2] || "",
        };
      }
    } catch (err: any) {
      return `Error(getForegroundApp): ${err.message}`;
    }
  }

  function getIdleTime(): number{
    const kCGEventSourceStateHIDSystemState = 1;
    const kCGAnyInputEventType = ~0 >>> 0; // 全イベント
    try {
      const cg = ffi.Library("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", {
        CGEventSourceSecondsSinceLastEventType: ["double", ["uint32", "uint32"]],
      });
      return cg.CGEventSourceSecondsSinceLastEventType(
        kCGEventSourceStateHIDSystemState,
        kCGAnyInputEventType
      );
    } catch (e: any) {
      // Fallback: try reading HIDIdleTime from IORegistry (nanoseconds)
      try {
        console.log("=====handling getidletime error=====");
        
        const out = execFileSync("ioreg", ["-c", "IOHIDSystem"], { encoding: "utf8" });
        const m = out.match(/HIDIdleTime[^0-9]*([0-9]+)/);
        if (m && m[1]) {
          const nanos = Number(m[1]);
          if (!Number.isNaN(nanos)) {
            return nanos / 1e9; // convert to seconds
          }
        }
        throw new Error("HIDIdleTime not found in ioreg output");
      } catch (e2: any) {
        throw new Error(`CoreGraphics load failed: ${e && e.message ? e.message : e}; ioreg fallback failed: ${e2 && e2.message ? e2.message : e2}`);
      }
    }
  }

  return { getForegroundApp, getIdleTime };
}

// エクスポート: 実行環境に応じて切り替え
export const systemUtils =
  platform === "win32" ? windowsApi() : platform === "darwin" ? macApi() : null;
