// // 現在使用していないファイル
// // Macで開いているGUIアプリケーションを認識するために、osascriptでapplescriptを呼び出す

// import { exec } from 'child_process';
// import { promisify } from 'util';
// import psList from 'ps-list';
// const execPromise = promisify(exec);
// const script = `
// tell application "System Events"
// 	set appList to name of every process whose visible is true
// 	set appList to appList as string
// end tell
// return appList
// `;
// async function getVisibleApps() {
// 	try {
// 		const { stdout } = await execPromise(`osascript -e '${script}'`);
// 		const appList = stdout.split(',').map(app => app.trim());
// 		return appList;
// 	} catch (error) {
// 		console.error('Error executing AppleScript:', error);
// 		return [];
// 	}
// }
// async function main() {
// 	const appList = await getVisibleApps();
// 	console.log('Visible Applications:', appList);
// 	// const lists = await psList();
// 	// let str = 'プロセス名リスト: '
// 	// lists.map((result) => {
// 	// 	str += result.name;
// 	// 	str += '|';
// 	// })
// 	// console.log(str);
// }
// main();



// /**
//  * import psList from 'ps-list';
// // import * from 'osascript';n

// // async function showProcess() {
// // 	console.log(await psList());
// // }

// // showProcess();

// async function findDiscord() {
// 	const lists = await psList();
// 	let str = 'プロセス名リスト: '
// 	lists.map((result) => {
// 		str += result.name;
// 		str += '|';
// 	})
// 	console.log(str);
	
// }

// findDiscord();
//  */