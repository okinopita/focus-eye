/**
 * スタンドアローンデータベース初期化スクリプト
 * 
 * 使用法:
 *   node scripts/init-db.js
 */
import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// データベースパスを取得（開発モード）
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`[初期化-db] データディレクトリを作成: ${dataDir}`);
}

const dbPath = path.join(dataDir, "focus-eye.db");
console.log(`[初期化-db] データベースパス: ${dbPath}`);

// データベース初期化
const SQL = await initSqlJs();
const db = new SQL.Database();

// スキーマをロード
const schemaPath = path.join(__dirname, "..", "src", "db", "schema.sql");
if (!fs.existsSync(schemaPath)) {
  console.error(`[初期化-db] エラー: schema.sql が見つかりません: ${schemaPath}`);
  process.exit(1);
}

const schemaSQL = fs.readFileSync(schemaPath, "utf8");
db.exec(schemaSQL);

console.log("[初期化-db] ✅ データベース初期化成功");

// テーブル情報を表示
const tables = db.exec(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name NOT LIKE 'sqlite_%'
`);

console.log("[初期化-db] 作成されたテーブル:");
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
