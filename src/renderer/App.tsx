/**
 * React App Component - Session UI
 */
import React, { useState } from "react";
import type { SessionResult, IpcSessionRequest } from "../common/types";

declare global {
  interface Window {
    electronAPI?: {
      startSession: (req: IpcSessionRequest) => Promise<{ success: boolean; result?: SessionResult; error?: string }>;
    };
  }
}

export default function App() {
  const [taskTitle, setTaskTitle] = useState("");
  const [taskIntent, setTaskIntent] = useState("");
  const [sessionSeconds, setSessionSeconds] = useState(50);
  const [enableAutomation, setEnableAutomation] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStartSession = async () => {
    console.log("[App] handleStartSession called");
    console.log("[App] window.electronAPI:", window.electronAPI);
    
    if (!window.electronAPI) {
      setError("Electron API not available");
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await window.electronAPI.startSession({
        sessionTimeMs: sessionSeconds * 1000,
        enableAutomation,
        taskTitle: taskTitle || undefined,
        taskIntent: taskIntent || undefined,
      });

      if (response.success && response.result) {
        setResult(response.result);
      } else {
        setError(response.error || "Session failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
    }
  };

  const formatDuration = (ms: number) => {
    const sec = Math.round(ms / 1000);
    return `${sec}s`;
  };

  const formatPercentage = (ms: number, totalMs: number) => {
    const pct = ((ms / totalMs) * 100).toFixed(1);
    return `${pct}%`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Focus Share</h1>
          <p className="text-slate-400">Session Tracker & App Usage Analytics</p>
        </div>

        {/* Session Controls */}
        <div className="bg-slate-700 rounded-lg p-6 mb-8 shadow-lg">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                Task Title (optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Electron app implementation"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                disabled={isRunning}
                className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded text-white disabled:opacity-50 placeholder-slate-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                Task Intent (optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Complete logging functionality"
                value={taskIntent}
                onChange={(e) => setTaskIntent(e.target.value)}
                disabled={isRunning}
                className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded text-white disabled:opacity-50 placeholder-slate-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                Session Duration (seconds)
              </label>
              <input
                type="number"
                min="1"
                max="18000"
                value={sessionSeconds}
                onChange={(e) => setSessionSeconds(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={isRunning}
                className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded text-white disabled:opacity-50"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="automation"
                checked={enableAutomation}
                onChange={(e) => setEnableAutomation(e.target.checked)}
                disabled={isRunning}
                className="w-4 h-4 rounded disabled:opacity-50"
              />
              <label htmlFor="automation" className="ml-2 text-sm text-slate-200">
                Enable Browser Tracking (AppleScript - requires automation permission)
              </label>
            </div>

            <button
              onClick={handleStartSession}
              disabled={isRunning}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-500 text-white font-bold rounded-lg transition"
            >
              {isRunning ? "Session Running..." : "[Session Start]"}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-900 border border-red-700 rounded-lg p-4 mb-8 text-red-200">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="bg-slate-700 rounded-lg p-6 shadow-lg">
            <h2 className="text-2xl font-bold text-white mb-6">Session Results</h2>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-slate-600 rounded p-4">
                <p className="text-slate-400 text-sm">Duration</p>
                <p className="text-white text-lg font-bold">{formatDuration(result.durationMs)}</p>
              </div>
              <div className="bg-slate-600 rounded p-4">
                <p className="text-slate-400 text-sm">App Switches</p>
                <p className="text-white text-lg font-bold">{result.appLogs.length}</p>
              </div>
              <div className="bg-slate-600 rounded p-4">
                <p className="text-slate-400 text-sm">Unique Apps</p>
                <p className="text-white text-lg font-bold">{Object.keys(result.usageSummary).length}</p>
              </div>
            </div>

            {/* Category Usage */}
            <div className="mb-8">
              <h3 className="text-lg font-bold text-white mb-4">Usage by Category</h3>
              <div className="space-y-2">
                {Object.entries(result.categoryUsageSummary)
                  .filter(([_, ms]) => ms > 0)
                  .sort(([_, a], [__, b]) => b - a)
                  .map(([category, ms]) => (
                    <div key={category} className="flex items-center justify-between bg-slate-600 rounded p-3">
                      <span className="text-slate-200 font-medium">{category}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-slate-400">{formatDuration(ms)}</span>
                        <span className="text-slate-300 font-bold w-12 text-right">
                          {formatPercentage(ms, result.durationMs)}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* App Usage */}
            <div>
              <h3 className="text-lg font-bold text-white mb-4">Usage by Application</h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {Object.entries(result.usageSummary)
                  .sort(([_, a], [__, b]) => b - a)
                  .map(([appName, ms]) => (
                    <div key={appName} className="flex items-center justify-between bg-slate-600 rounded p-3">
                      <span className="text-slate-200 truncate">{appName}</span>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <span className="text-slate-400">{formatDuration(ms)}</span>
                        <span className="text-slate-300 font-bold w-12 text-right">
                          {formatPercentage(ms, result.durationMs)}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
