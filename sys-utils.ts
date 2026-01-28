import ffi from "ffi-napi";
import ref from "ref-napi";
import StructType from "ref-struct-napi";
import os from "os";

const platform = os.platform();

/**
 * Windows実装
 */
// function windowsApi() {
//   // --- GetForegroundWindow ---
//   const user32 = ffi.Library("user32", {
//     GetForegroundWindow: ["int32", []],
//     GetWindowThreadProcessId: ["uint32", ["int32", "uint32*"]],
//   });

//   // --- GetLastInputInfo ---
//   const LASTINPUTINFO = StructType({
//     cbSize: "uint32",
//     dwTime: "uint32",
//   });

//   const kernel32 = ffi.Library("kernel32", {
//     GetTickCount: ["uint32", []],
//   });

//   const user32Extra = ffi.Library("user32", {
//     GetLastInputInfo: ["int", [ref.refType(LASTINPUTINFO)]],
//   });

//   function getForegroundApp(): number {
//     const hwnd = user32.GetForegroundWindow();
//     const pidBuf = ref.alloc("uint32");
//     user32.GetWindowThreadProcessId(hwnd, pidBuf);
//     return pidBuf.deref(); // プロセスID
//   }

//   function getIdleTime(): number {
//     const info = new LASTINPUTINFO();
//     info.cbSize = LASTINPUTINFO.length;
//     user32Extra.GetLastInputInfo(info.ref());
//     const tickCount = kernel32.GetTickCount();
//     return (tickCount - info.dwTime) / 1000; // 秒
//   }

//   return { getForegroundApp, getIdleTime };
// }

/**
 * macOS実装
 */
function macApi() {
  const foundation = ffi.Library("/System/Library/Frameworks/AppKit.framework/AppKit", {
    // NSWorkspace.eyedWorkspace.frontmostApplication.localizedName を直接は呼びにくいので
    // 実際はネイティブブリッジ用の小さなObjective-Cプログラムをかませる必要あり。
    // ここではダミーで示す
  });

  const coreGraphics = ffi.Library("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", {
    CGEventSourceSecondsSinceLastEventType: ["double", ["uint32", "uint32"]],
  });

  function getForegroundApp(): string {
    // 実際には Objective-C ブリッジが必要
    return "NotImplemented(macOS requires ObjC bridge)";
  }

  function getIdleTime(): number {
    const kCGEventSourceStateHIDSystemState = 1;
    const kCGAnyInputEventType = ~0 >>> 0; // 全イベント
    return coreGraphics.CGEventSourceSecondsSinceLastEventType(
      kCGEventSourceStateHIDSystemState,
      kCGAnyInputEventType
    );
  }

  return { getForegroundApp, getIdleTime };
}

// エクスポート: 実行環境に応じて切り替え
export const systemUtils =
//   platform === "win32" ? windowsApi() : platform === "darwin" ? macApi() : null;
platform === "darwin" ? macApi() : null;
