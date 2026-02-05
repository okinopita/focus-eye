/**
 * Electron IPC通信用プリロードスクリプト
 */
const { contextBridge, ipcRenderer } = require("electron");

console.log("[プリロード] プリロードスクリプトをロード中");

contextBridge.exposeInMainWorld("electronAPI", {
  initDatabase: () =>
    ipcRenderer.invoke("init:database"),
  startSession: (req: any) =>
    ipcRenderer.invoke("session:start", req),
  stopSession: () =>
    ipcRenderer.invoke("session:stop"),
  getActiveGoals: () =>
    ipcRenderer.invoke("goals:getActive"),
  getAllGoals: () =>
    ipcRenderer.invoke("goals:getAll"),
  createGoal: (goalData: any) =>
    ipcRenderer.invoke("goals:create", goalData),
  getTotalTimeByGoal: (goalId: number) =>
    ipcRenderer.invoke("sessions:getTotalTimeByGoal", goalId),
  openExternal: (url: string) =>
    ipcRenderer.invoke("shell:openExternal", url),
});

console.log("[プリロード] electronAPI をウィンドウに公開");
