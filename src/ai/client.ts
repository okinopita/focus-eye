/**
 * AWS Bedrock AI 評価クライアント
 * 
 * OTHER アプリ分類を AWS Claude モデルに送信して再分類
 */

import type { AIClassificationInput, AIClassificationOutput, AWSBedrockRequest, AppWithRelevanceScore } from "./types";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let SYSTEM_PROMPT = "";
let SYSTEM_PROMPT_BROWSER = "";

function loadSystemPrompt(isBrowserMode: boolean = false): string {
  // 実行時に dist/ai/system_prompt.md または system_prompt-browser.md からロード
  // 開発時には src/ai/system_prompt.md から読み込み
  const promptFile = isBrowserMode ? "system_prompt-browser.md" : "system_prompt.md";
  
  try {
    // 最初に dist を試す（本番環境）
    const distPath = path.join(__dirname, promptFile);
    if (fs.existsSync(distPath)) {
      return fs.readFileSync(distPath, "utf8");
    }
    // src にフォールバック（開発環境）
    const srcPath = path.join(__dirname, "..", "..", "src", "ai", promptFile);
    if (fs.existsSync(srcPath)) {
      return fs.readFileSync(srcPath, "utf8");
    }
  } catch (e) {
    console.error(`[AI] Failed to load system prompt (${promptFile}):`, e);
  }
  return "";
}

// 起動時に両方のプロンプトをロード
SYSTEM_PROMPT = loadSystemPrompt(false);
SYSTEM_PROMPT_BROWSER = loadSystemPrompt(true);

interface AWSConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * 環境変数から AWS 認証情報を取得
 */
function getAWSConfig(): AWSConfig | null {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    console.warn("[AI] AWS credentials not configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY");
    return null;
  }

  return { region, accessKeyId, secretAccessKey };
}

/**
 * AWS Bedrock モデル用リクエストオブジェクトを構築
 * 
 * モデル: Amazon Nova 2 Lite (us.amazon.nova-2-lite-v1:0)
 *   - オンデマンドアクセス用推論プロフィール
 */
function buildBedrockRequest(
  input: AIClassificationInput,
  systemPrompt: string,
  taskTitle?: string,
  useBrowserPrompt: boolean = false
): AWSBedrockRequest {
  let userInput: any;

  if (useBrowserPrompt && input.other_apps) {
    // ブラウザモード: window_titles_sample を個別の実行エントリに展開
    const apps: Array<{ executing: string }> = [];
    
    for (const app of input.other_apps) {
      if (app.window_titles_sample && app.window_titles_sample.length > 0) {
        // 各ブラウザタイトルを個別のアプリとして追加
        for (const title of app.window_titles_sample) {
          apps.push({ executing: title });
        }
      } else {
        // ブラウザタイトルなし、アプリ名を使用
        apps.push({ executing: app.app_name });
      }
    }

    userInput = {
      task_title: taskTitle || "タスク名未設定",
      apps: apps,
    };
  } else {
    // 標準モード: 元の形式を使用
    userInput = input;
  }

  return {
    modelId: "us.amazon.nova-2-lite-v1:0", // Amazon Nova 2 Lite 推論プロファイル
    system: [
      {
        text: systemPrompt,
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            text: JSON.stringify(userInput),
          },
        ],
      },
    ],
    inferenceConfig: {
      max_new_tokens: 512,
      temperature: 0.3,
    },
  };
}

/**
 * AIレスポンスをパースし、期待されるスキーマに対して検証する
 * 生のJSONおよびマークダウンでラップされたJSONの両方を処理
 */
function parseAIResponse(responseText: string): AIClassificationOutput | null {
  try {
    // マークダウンコードブロックラッパーが存在する場合は削除
    let jsonText = responseText.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    console.log("[AI] レスポンスから JSON を抽出:", jsonText.substring(0, 100));

    const parsed = JSON.parse(jsonText);

    // reclassified_apps を検証
    if (!Array.isArray(parsed.reclassified_apps)) {
      console.error("[AI] Missing reclassified_apps array");
      return null;
    }

    for (const item of parsed.reclassified_apps) {
      if (!item.app_name || !item.new_category) {
        console.error("[AI] Invalid reclassified app item:", item);
        return null;
      }
    }

    return parsed as AIClassificationOutput;
  } catch (e) {
    console.error("[AI] Failed to parse AI response:", e);
    return null;
  }
}

/**
 * OTHER / BROWSER アプリを AWS Bedrock モデルで分類
 * 
 * @param otherApps - OTHER または BROWSER と分類されたアプリの配列
 * @param taskTitle - コンテキスト認識分類のためのタスクタイトル
 * @param useBrowserPrompt - ブラウザ対応分類プロンプトを使用するかどうか
 * @returns タスク関連スコア付きの分類結果
 */
export async function classifyOtherAppsWithAI(
  otherApps: Array<{ app_name: string; seconds: number; window_titles_sample: string[] }>,
  taskTitle?: string,
  useBrowserPrompt: boolean = false
): Promise<Array<AppWithRelevanceScore> | null> {
  // OTHER/BROWSER アプリがない場合は空結果を返す
  if (otherApps.length === 0) {
    return [];
  }

  const awsConfig = getAWSConfig();
  const systemPrompt = useBrowserPrompt ? SYSTEM_PROMPT_BROWSER : SYSTEM_PROMPT;

  if (!awsConfig) {
    console.warn("[AI] AWS not configured, skipping classification");
    return getMockClassification(otherApps, taskTitle);
  }

  try {
    console.log(`[AI] ${otherApps.length} 件のアプリを分類中 (browserMode=${useBrowserPrompt})...`);
    const request = buildBedrockRequest({ other_apps: otherApps }, systemPrompt, taskTitle, useBrowserPrompt);
    
    // デバッグ用にAI入力をログ出力
    console.log("[AI] AI への入力:", JSON.stringify(JSON.parse(request.messages[0].content[0].text), null, 2));

    // 実際のAWS Bedrock APIコールを実行
    const response = await invokeBedrockModel(request, awsConfig);
    if (!response) {
      console.error("[AI] Failed to get response from Bedrock");
      return getMockClassification(otherApps);
    }

    // レスポンスからテキストを抽出してパース（Amazon Nova 形式）
    let responseText = "";
    if (response.output?.message?.content && Array.isArray(response.output.message.content)) {
      responseText = response.output.message.content
        .map((c: any) => c.text)
        .join("");
    } else if (response.content && Array.isArray(response.content)) {
      // Claude 形式用フォールバック
      responseText = response.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("");
    }

    if (!responseText) {
      console.error("[AI] Empty response from Bedrock");
      return getMockClassification(otherApps);
    }

    const parsed = parseAIResponse(responseText);
    if (parsed) {
      console.log("[AI] アプリ分類成功");
      return addRelevanceScores(parsed.reclassified_apps, taskTitle);
    } else {
      console.error("[AI] Failed to parse Bedrock response");
      return getMockClassification(otherApps, taskTitle);
    }
  } catch (e) {
    console.error("[AI] Error calling AWS Bedrock:", e);
    return getMockClassification(otherApps, taskTitle);
  }
}

/**
 * モック評価。現在はほぼ使用しない
 */
function getMockClassification(
  otherApps: Array<{ app_name: string; seconds: number; window_titles_sample: string[] }>,
  taskTitle?: string
): Array<AppWithRelevanceScore> {
  const reclassified_apps = otherApps.map((app) => {
    return { app_name: app.app_name, new_category: "OTHER" };
  });

  const output: AIClassificationOutput = { reclassified_apps };
  return addRelevanceScores(output.reclassified_apps, taskTitle);
}

/**
 * Add task_relevance_score based on classified category
 * Scores are computed locally after AI classification
 */
function addRelevanceScores(
  reclassifiedApps: AIClassificationOutput['reclassified_apps'],
  taskTitle?: string
): Array<AppWithRelevanceScore> {
  return reclassifiedApps.map((app) => ({
    app_name: app.app_name,
    new_category: app.new_category,
    task_relevance_score: getRelevanceScoreForCategory(app.new_category),
  }));
}

/**
 * Determine task relevance score based on category
 * 
 * 1.0  = WORK (task-related work)
 * 0.75 = PRODUCTIVITY (productive but relation unclear)
 * 0.5  = COMMUNICATION (neutral, may be related)
 * 0.0  = ENTERTAINMENT (unrelated to task)
 * -1.0 = OTHER (unknown, exclude from scoring)
 */
function getRelevanceScoreForCategory(category: string): number {
  switch (category) {
    case "WORK":
      return 1.0; // タスクに関連する作業
    case "PRODUCTIVITY":
      return 0.75; // 生産的だが関連性不明
    case "COMMUNICATION":
      return 0.5; // 中立 - 仕事関連または個人的かもしれない
    case "ENTERTAINMENT":
      return 0.0; // 明らかにタスク無関連
    case "GAME":
      return 0.0; // 明らかな気晴らし
    case "OTHER":
      return -1.0; // 不明 - 計算から除外
    default:
      return -1.0;
  }
}

/**
 * Invoke AWS Bedrock InvokeModel API
 */
async function invokeBedrockModel(
  request: AWSBedrockRequest,
  awsConfig: { region: string; accessKeyId: string; secretAccessKey: string }
): Promise<any> {
  try {
    // ハード依存を避けるための動的インポート
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const awsSDK = await import("@aws-sdk/client-bedrock-runtime" as any);
    const BedrockRuntimeClient = awsSDK.BedrockRuntimeClient;
    const InvokeModelCommand = awsSDK.InvokeModelCommand;

    const client = new BedrockRuntimeClient({ region: awsConfig.region });

    const command = new InvokeModelCommand({
      modelId: request.modelId,
      body: JSON.stringify({
        system: request.system,
        messages: request.messages,
        inferenceConfig: request.inferenceConfig || {
          max_new_tokens: 512,
          temperature: 0.3,
        },
      }),
    });

    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    console.log("[AI] Bedrock 生レスポンス:", JSON.stringify(responseBody, null, 2));

    // Nova の構造を保持するために完全な responseBody を返す
    return responseBody;
  } catch (e: any) {
    if (e.message?.includes("Cannot find module") || e.message?.includes("ERR_MODULE_NOT_FOUND")) {
      console.warn(
        "[AI] AWS SDK not installed. To enable Bedrock integration, run: npm install @aws-sdk/client-bedrock-runtime"
      );
    } else {
      console.error("[AI] Bedrock API call failed:", e.message);
    }
    return null;
  }
}
