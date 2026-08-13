import { setTimeout } from 'timers/promises';
import { systemUtils, setUseAutomation } from './getForegroundApp.js';
import { MIN_INTERVAL_MS } from '../common/consts.js';

const SESSION_TIME = 50 * 1000; // セッション時間のミリ秒
// const MAX_INTERVAL_MS = 6000;

type checked = {
  appName: string;
  idleTime: number | string;
}
// てすとこめんと

// /**
//  * チェック間隔のミリ秒をランダムに生成する
//  * @param factor 係数
//  * @param maxInterval 最大間隔
//  * @param minInterval 最小間隔
//  * @returns ミリ秒
//  */
// const generateIntervalMS = function (factor: number, maxInterval: number, minInterval: number): number {
//     const time = Math.floor(Math.random() * (maxInterval - minInterval) * factor + minInterval);
//     console.log("インターバル: " + time);
//     return time;

// }

/**
 * タスクセッションを実行する。
 * @param sessionTime セッション時間のミリ秒
 */
async function TaskSession(sessionTime: number,) {
  if (!systemUtils) {
    console.error('systemUtils is null (unsupported platform)');
    process.exit(1);
  }

  // AppleScript自動化（強化モード）を有効にするためにランタイムフラグ/環境をチェック
  const enableAutomationEnv = process.env.ENABLE_AUTOMATION === '1';
  const enableAutomationArg = process.argv.includes('--enable-automation');
  const enableAutomation = enableAutomationEnv || enableAutomationArg;
  setUseAutomation(Boolean(enableAutomation));
  console.log('Automation (AppleScript) 有効:', enableAutomation);


  // セッション時間までループ
  const startTime = Date.now();
  while (Date.now() - startTime < sessionTime) {
    await setTimeout(MIN_INTERVAL_MS);
    // 最前面アプリケーションを取得
    try {
      const fg = await systemUtils.getForegroundApp();
      if(typeof fg === 'object') {
        // console.log('appDisplayName:', fg.appDisplayName);
        // console.log('appExecutable:', fg.appExecutable);
        // console.log('windowTitle  :', fg.windowTitle);
        console.log(fg);
        
      } else {
        console.log('getForegroundApp から ->', fg);
      }
    } catch (e: any) {
      console.error('getForegroundApp error ->', e && e.message ? e.message : e);
    }

    // アイドル時間を取得
    try {
      const idle = (systemUtils) ? systemUtils.getIdleTime(): "none";
      console.log('getIdleTime ->', idle);

    } catch (e: any) {
      console.error('getIdleTime エラー ->', e && e.message ? e.message : e);
    }
  }
}

TaskSession(SESSION_TIME);


