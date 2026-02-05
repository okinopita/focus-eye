/**
 * SQLite データベース接続・初期化 (SQL.js)
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
 * データベースファイルパスを取得（開発環境のみ）
 * - 常に使用: ./data/focus-eye.db
 */
function getDatabasePath(): string {
  const devPath = path.join(process.cwd(), "data");
  if (!fs.existsSync(devPath)) {
    fs.mkdirSync(devPath, { recursive: true });
  }
  return path.join(devPath, "focus-eye.db");
}

/**
 * データベースを初期化してテーブルを作成
 */
export async function initializeDatabase(): Promise<SqlJsDatabase> {
  if (db) {
    return db;
  }

  const dbPath = getDatabasePath();
  console.log(`[DB] データベース初期化中: ${dbPath}`);

  // SQL.js を初期化
  SQL = await initSqlJs();

  // 既存のデータベースをロード、またはまったく新しいものを作成
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log("[DB] 既存のデータベースをロード完了");
    
    // テーブルが存在するかをチェック
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='goals'");
    const tablesExist = result.length > 0 && result[0].values.length > 0;
    
    if (!tablesExist) {
      console.log("[DB] テーブルが見つからないため、スキーマ作成中...");
      // テーブルが存在しない場合のみスキーマをロードして実行
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
    console.log("[DB] 新規データベース作成完了");
    
    // 新しいデータベース用にスキーマをロードして実行
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
  
  console.log("[DB] データベース初期化成功");

  return db;
}

/**
 * データベースをファイルに保存
 */
export function saveDatabaseToFile(): void {
  if (!db) return;
  
  const dbPath = getDatabasePath();
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

/**
 * データベースインスタンスを取得
 */
export function getDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return db;
}

/**
 * データベース接続を閉じる
 */
export function closeDatabase(): void {
  if (db) {
    saveDatabaseToFile();
    db.close();
    db = null;
    console.log("[DB] データベース接続をクローズしました");
  }
}
