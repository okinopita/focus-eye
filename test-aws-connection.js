// /**
//  * Test AWS Bedrock connection　製品とは独立したテスト用です
//  */
// import * as fs from "fs";
// import * as path from "path";
// import { fileURLToPath } from "url";
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// // Load .env
// function loadEnv() {
//     const envPath = path.join(__dirname, ".env");
//     if (fs.existsSync(envPath)) {
//         const envContent = fs.readFileSync(envPath, "utf8");
//         envContent.split("\n").forEach((line) => {
//             const trimmed = line.trim();
//             if (trimmed && !trimmed.startsWith("#")) {
//                 const [key, value] = trimmed.split("=");
//                 if (key && value) {
//                     process.env[key.trim()] = value.trim();
//                 }
//             }
//         });
//         console.log("[Test] .env loaded");
//     }
// }
// loadEnv();
// // Check environment variables
// console.log("=== AWS Credentials Check ===");
// console.log(`AWS_REGION: ${process.env.AWS_REGION ? "✅ SET" : "❌ NOT SET"}`);
// console.log(`AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? "✅ SET (length: " + process.env.AWS_ACCESS_KEY_ID.length + ")" : "❌ NOT SET"}`);
// console.log(`AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? "✅ SET (length: " + process.env.AWS_SECRET_ACCESS_KEY.length + ")" : "❌ NOT SET"}`);
// // Test Bedrock connection
// async function testBedrockConnection() {
//     console.log("\n=== Testing Bedrock Connection ===");
//     try {
//         const awsSDK = await import("@aws-sdk/client-bedrock-runtime");
//         const BedrockRuntimeClient = awsSDK.BedrockRuntimeClient;
//         const InvokeModelCommand = awsSDK.InvokeModelCommand;
//         console.log("✅ AWS SDK imported successfully");
//         const region = process.env.AWS_REGION;
//         const client = new BedrockRuntimeClient({ region });
//         console.log(`Connecting to Bedrock in ${region}...`);
//         // Simple test payload for Amazon Nova
//         const testPayload = {
//             system: [{ text: "You are a helpful assistant." }],
//             messages: [
//                 {
//                     role: "user",
//                     content: [
//                         {
//                             text: "Say 'Connection successful' in JSON format: {\"status\": \"ok\", \"message\": \"...\"}",
//                         },
//                     ],
//                 },
//             ],
//             inferenceConfig: {
//                 max_new_tokens: 256,
//                 temperature: 0.3,
//             },
//         };
//         const command = new InvokeModelCommand({
//             modelId: "us.amazon.nova-2-lite-v1:0",
//             body: JSON.stringify(testPayload),
//         });
//         console.log("Sending request to Bedrock...");
//         const response = await client.send(command);
//         const responseBody = JSON.parse(new TextDecoder().decode(response.body));
//         console.log("\n✅ Bedrock responded successfully!");
//         console.log("Response:", JSON.stringify(responseBody, null, 2));
//         // Extract message
//         if (responseBody.content && Array.isArray(responseBody.content)) {
//             const textContent = responseBody.content.find((c) => c.type === "text");
//             if (textContent) {
//                 console.log("\n📝 Model Response:");
//                 console.log(textContent.text);
//             }
//         }
//     }
//     catch (e) {
//         console.error("❌ Bedrock connection failed:");
//         console.error(e.message);
//         if (e.message?.includes("Cannot find module")) {
//             console.error("\n💡 Fix: Install AWS SDK");
//             console.error("   npm install @aws-sdk/client-bedrock-runtime");
//         }
//         else if (e.message?.includes("InvalidUserID")) {
//             console.error("\n💡 Fix: Check AWS credentials (Access Key ID seems invalid)");
//         }
//         else if (e.message?.includes("InvalidSignatureException")) {
//             console.error("\n💡 Fix: Check AWS credentials (Secret Access Key seems invalid)");
//         }
//         else if (e.message?.includes("AuthorizationException")) {
//             console.error("\n💡 Fix: Check IAM permissions or Bedrock model access");
//         }
//     }
// }
// testBedrockConnection();
