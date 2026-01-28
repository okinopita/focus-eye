/**
 * AWS Bedrock AI Evaluation Client
 * 
 * Sends OTHER app classification to AWS Claude model for reclassification
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
  // At runtime, load from dist/ai/system_prompt.md or system_prompt-browser.md
  // For development, read from src/ai/system_prompt.md
  const promptFile = isBrowserMode ? "system_prompt-browser.md" : "system_prompt.md";
  
  try {
    // Try dist first (production)
    const distPath = path.join(__dirname, promptFile);
    if (fs.existsSync(distPath)) {
      return fs.readFileSync(distPath, "utf8");
    }
    // Fallback to src (development)
    const srcPath = path.join(__dirname, "..", "..", "src", "ai", promptFile);
    if (fs.existsSync(srcPath)) {
      return fs.readFileSync(srcPath, "utf8");
    }
  } catch (e) {
    console.error(`[AI] Failed to load system prompt (${promptFile}):`, e);
  }
  return "";
}

// Load both prompts on startup
SYSTEM_PROMPT = loadSystemPrompt(false);
SYSTEM_PROMPT_BROWSER = loadSystemPrompt(true);

interface AWSConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Get AWS credentials from environment variables
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
 * Build request object for AWS Bedrock model
 * 
 * Model: Amazon Nova 2 Lite (us.amazon.nova-2-lite-v1:0)
 *   - Inference Profile for on-demand access
 */
function buildBedrockRequest(input: AIClassificationInput, systemPrompt: string): AWSBedrockRequest {
  return {
    modelId: "us.amazon.nova-2-lite-v1:0", // Amazon Nova 2 Lite Inference Profile
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
            text: JSON.stringify(input),
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
 * Parse AI response and validate against expected schema
 * Handles both raw JSON and markdown-wrapped JSON
 */
function parseAIResponse(responseText: string): AIClassificationOutput | null {
  try {
    // Remove markdown code block wrapper if present
    let jsonText = responseText.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    console.log("[AI] Extracting JSON from response:", jsonText.substring(0, 100));

    const parsed = JSON.parse(jsonText);

    // Validate reclassified_apps
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
 * Classify OTHER / BROWSER apps using AWS Bedrock model
 * 
 * @param otherApps - Array of apps classified as OTHER or BROWSER
 * @param taskTitle - Task title for context-aware classification
 * @param useBrowserPrompt - Whether to use browser-aware classification prompt
 * @returns Classification result with task relevance scores
 */
export async function classifyOtherAppsWithAI(
  otherApps: Array<{ app_name: string; seconds: number; window_titles_sample: string[] }>,
  taskTitle?: string,
  useBrowserPrompt: boolean = false
): Promise<Array<AppWithRelevanceScore> | null> {
  // If no OTHER/BROWSER apps, return empty result
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
    console.log(`[AI] Classifying ${otherApps.length} apps (browserMode=${useBrowserPrompt})...`);
    const request = buildBedrockRequest({ other_apps: otherApps }, systemPrompt);

    // Make actual AWS Bedrock API call
    const response = await invokeBedrockModel(request, awsConfig);
    if (!response) {
      console.error("[AI] Failed to get response from Bedrock");
      return getMockClassification(otherApps);
    }

    // Extract text from response and parse (Amazon Nova format)
    let responseText = "";
    if (response.output?.message?.content && Array.isArray(response.output.message.content)) {
      responseText = response.output.message.content
        .map((c: any) => c.text)
        .join("");
    } else if (response.content && Array.isArray(response.content)) {
      // Fallback for Claude format
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
      console.log("[AI] Successfully classified apps");
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
 * Mock classification for development/testing
 * Applies simple heuristic rules
 */
function getMockClassification(
  otherApps: Array<{ app_name: string; seconds: number; window_titles_sample: string[] }>,
  taskTitle?: string
): Array<AppWithRelevanceScore> {
  console.log("[AI] Using MOCK classification (AWS credentials not available)");
  const reclassified_apps = otherApps.map((app) => {
    const name = app.app_name.toLowerCase();
    const titles = (app.window_titles_sample || []).join(" ").toLowerCase();

    console.log(`[AI Mock] Evaluating: "${app.app_name}" | titles: ${titles || "(empty)"}`);

    // Simple keyword matching
    if (name.includes("code") || name.includes("studio") || name.includes("xcode")) {
      return { app_name: app.app_name, new_category: "WORK" };
    }
    if (name.includes("notion") || name.includes("word") || name.includes("excel")) {
      return { app_name: app.app_name, new_category: "WORK" };
    }
    if (titles.includes("youtube") || titles.includes("netflix") || titles.includes("twitch")) {
      return { app_name: app.app_name, new_category: "ENTERTAINMENT" };
    }
    if (titles.includes("github") || titles.includes("mdn") || titles.includes("stackoverflow")) {
      return { app_name: app.app_name, new_category: "WORK" };
    }
    if (name.includes("slack") || name.includes("discord") || name.includes("teams")) {
      return { app_name: app.app_name, new_category: "COMMUNICATION" };
    }
    if (name.includes("epic") || name.includes("game")) {
      console.log(`[AI Mock] "${app.app_name}" matched GAME keyword`);
      return { app_name: app.app_name, new_category: "GAME" };
    }

    console.log(`[AI Mock] "${app.app_name}" -> OTHER (no match)`);
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
 * 1.0  = WORK (directly related to task)
 * 0.5  = COMMUNICATION (neutral, may be related)
 * 0.0  = ENTERTAINMENT (unrelated to task)
 * -1.0 = OTHER (unknown, exclude from scoring)
 */
function getRelevanceScoreForCategory(category: string): number {
  switch (category) {
    case "WORK":
      return 1.0; // Directly task-related
    case "COMMUNICATION":
      return 0.5; // Neutral - may be work-related or personal
    case "ENTERTAINMENT":
      return 0.0; // Clearly not task-related
    case "GAME":
      return 0.0; // Clearly distraction
    case "OTHER":
      return -1.0; // Unknown - exclude from calculation
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
    // Dynamic import to avoid hard dependency
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

    console.log("[AI] Bedrock raw response:", JSON.stringify(responseBody, null, 2));

    // Return the full responseBody to preserve Nova's structure
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
