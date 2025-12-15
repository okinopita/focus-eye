import { setTimeout } from 'timers/promises';
import { systemUtils } from './getForegroundApp.ts';
import { log } from 'console';

const SESSION_TIME = 50 * 1000; // セッション時間のミリ秒
const checkIntervalFactor = 1.0;
const MIN_INTERVAL_MS = 5000;
const MAX_INTERVAL_MS = 15000;

type checked = {
  appName: string;
  idleTime: number | string;
}

/**
 * チェック間隔のミリ秒をランダムに生成する
 * @param factor 係数
 * @param maxInterval 最大間隔
 * @param minInterval 最小間隔
 * @returns ミリ秒
 */
const generateIntervalMS = function (factor: number, maxInterval: number, minInterval: number): number {
    const time = Math.floor(Math.random() * (maxInterval - minInterval) * factor + minInterval);
    console.log("interval:" + time);
    return time;

}

/**
 * タスクセッションを実行する。
 * @param sessionTime セッション時間のミリ秒
 */
async function TaskSession(sessionTime: number,) {
  if (!systemUtils) {
    console.error('systemUtils is null (unsupported platform)');
    process.exit(1);
  }


  // セッション時間までループ
  const startTime = Date.now();
  while (Date.now() - startTime < sessionTime) {
    await setTimeout(generateIntervalMS(checkIntervalFactor, MAX_INTERVAL_MS, MIN_INTERVAL_MS)); // ランダムな時間待機
    // get foreground app
    try {
      const fg = systemUtils.getForegroundApp();
      if(typeof fg === 'object') {
        // console.log('appDisplayName:', fg.appDisplayName);
        // console.log('appExecutable:', fg.appExecutable);
        // console.log('windowTitle  :', fg.windowTitle);
        console.log(fg);
        
      }
    } catch (e: any) {
      console.error('getForegroundApp error ->', e && e.message ? e.message : e);
    }

    // get idle time
    try {
      const idle = (systemUtils) ? systemUtils.getIdleTime(): "none";
      console.log('getIdleTime ->', idle);

    } catch (e: any) {
      console.error('getIdleTime error ->', e && e.message ? e.message : e);
    }
  }
}

TaskSession(SESSION_TIME);


