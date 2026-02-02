/**
 * SQLite Database Connection and Initialization (SQL.js)
 */
import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from "sql.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { app } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: SqlJsDatabase | null = null;
let SQL: SqlJsStatic | null = null;

/**
 * Get database file path (Development only)
 * - Always use: ./data/focus-eye.db
 */
function getDatabasePath(): string {
  const devPath = path.join(process.cwd(), "data");
  if (!fs.existsSync(devPath)) {
    fs.mkdirSync(devPath, { recursive: true });
  }
  return path.join(devPath, "focus-eye.db");
}

/**
 * Initialize database and create tables
 */
export async function initializeDatabase(): Promise<SqlJsDatabase> {
  if (db) {
    return db;
  }

  const dbPath = getDatabasePath();
  console.log(`[DB] Initializing database at: ${dbPath}`);

  // Initialize SQL.js
  SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log("[DB] Loaded existing database");
    
    // Check if tables exist
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='goals'");
    const tablesExist = result.length > 0 && result[0].values.length > 0;
    
    if (!tablesExist) {
      console.log("[DB] Tables not found, creating schema...");
      // Load and execute schema only if tables don't exist
      const schemaPath = path.join(__dirname, "schema.sql");
      const schemaSrc = path.join(__dirname, "..", "..", "src", "db", "schema.sql");
      
      let schemaSQL = "";
      if (fs.existsSync(schemaPath)) {
        schemaSQL = fs.readFileSync(schemaPath, "utf8");
      } else if (fs.existsSync(schemaSrc)) {
        schemaSQL = fs.readFileSync(schemaSrc, "utf8");
      } else {
        throw new Error("schema.sql not found");
      }
      
      db.exec(schemaSQL);
      saveDatabaseToFile();
    }
  } else {
    db = new SQL.Database();
    console.log("[DB] Created new database");
    
    // Load and execute schema for new database
    const schemaPath = path.join(__dirname, "schema.sql");
    const schemaSrc = path.join(__dirname, "..", "..", "src", "db", "schema.sql");
    
    let schemaSQL = "";
    if (fs.existsSync(schemaPath)) {
      schemaSQL = fs.readFileSync(schemaPath, "utf8");
    } else if (fs.existsSync(schemaSrc)) {
      schemaSQL = fs.readFileSync(schemaSrc, "utf8");
    } else {
      throw new Error("schema.sql not found");
    }
    
    db.exec(schemaSQL);
    saveDatabaseToFile();
  }
  
  console.log("[DB] Database initialized successfully");

  return db;
}

/**
 * Save database to file
 */
export function saveDatabaseToFile(): void {
  if (!db) return;
  
  const dbPath = getDatabasePath();
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

/**
 * Get database instance
 */
export function getDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return db;
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    saveDatabaseToFile();
    db.close();
    db = null;
    console.log("[DB] Database connection closed");
  }
}
