/**
 * Preload script for Electron IPC communication
 */
const { contextBridge, ipcRenderer } = require("electron");

console.log("[Preload] Loading preload script");

contextBridge.exposeInMainWorld("electronAPI", {
  startSession: (req: any) =>
    ipcRenderer.invoke("session:start", req),
});

console.log("[Preload] electronAPI exposed to window");
