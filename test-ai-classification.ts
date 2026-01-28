// /**
//  * Test script for AI classification functionality
//  */
// import { classifyOtherAppsWithAI } from "./dist/ai/client.js";

// async function testClassification() {
//   console.log("=== AI Classification Test ===\n");

//   const otherApps = [
//     {
//       app_name: "Finder",
//       seconds: 300,
//       window_titles_sample: [],
//     },
//     {
//       app_name: "Mail",
//       seconds: 450,
//       window_titles_sample: [],
//     },
//     {
//       app_name: "Notion",
//       seconds: 600,
//       window_titles_sample: ["My Project – Notion"],
//     },
//     {
//       app_name: "UnknownApp",
//       seconds: 150,
//       window_titles_sample: ["GitHub focus-eye"],
//     },
//   ];

//   console.log("Input (OTHER apps):");
//   console.log(JSON.stringify(otherApps, null, 2));
//   console.log("\nCalling AI classification...\n");

//   const result = await classifyOtherAppsWithAI(otherApps);

//   console.log("Output (Classification result):");
//   console.log(JSON.stringify(result, null, 2));

//   if (result) {
//     console.log("\n=== Summary ===");
//     for (const app of result.reclassified_apps) {
//       console.log(`${app.app_name} → ${app.new_category}`);
//     }
//   }
// }

// testClassification().catch(console.error);
