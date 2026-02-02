/**
 * Preload script for Electron IPC communication
 */
const { contextBridge, ipcRenderer } = require("electron");

console.log("[Preload] Loading preload script");

contextBridge.exposeInMainWorld("electronAPI", {
  startSession: (req: any) =>
    ipcRenderer.invoke("session:start", req),
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

console.log("[Preload] electronAPI exposed to window");
