/**
 * Standalone Database Initialization Script
 * 
 * Usage:
 *   node scripts/init-db.js
 */
import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get database path (development mode)
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`[init-db] Created data directory: ${dataDir}`);
}

const dbPath = path.join(dataDir, "focus-eye.db");
console.log(`[init-db] Database path: ${dbPath}`);

// Initialize database
const SQL = await initSqlJs();
const db = new SQL.Database();

// Load schema
const schemaPath = path.join(__dirname, "..", "src", "db", "schema.sql");
if (!fs.existsSync(schemaPath)) {
  console.error(`[init-db] ERROR: schema.sql not found at ${schemaPath}`);
  process.exit(1);
}

const schemaSQL = fs.readFileSync(schemaPath, "utf8");
db.exec(schemaSQL);

console.log("[init-db] ✅ Database initialized successfully");

// Show table info
const tables = db.exec(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name NOT LIKE 'sqlite_%'
`);

console.log("[init-db] Tables created:");
if (tables.length > 0) {
  tables[0].values.forEach((row) => {
    console.log(`  - ${row[0]}`);
  });
}

// Save to file
const data = db.export();
const buffer = Buffer.from(data);
fs.writeFileSync(dbPath, buffer);
console.log(`[init-db] File: ${dbPath}`);

db.close();
