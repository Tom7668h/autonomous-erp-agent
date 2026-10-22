import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Database as DatabaseType } from 'better-sqlite3';
import { getDatabase } from './database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Seeder');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

export function initAndSeedDatabase(dbInstance?: DatabaseType): void {
  const db = dbInstance || getDatabase();

  const schemaPath = path.resolve(rootDir, 'schema.sql');
  const seedPath = path.resolve(rootDir, 'data', 'seed_erp_data.sql');

  logger.info(`Applying database schema from ${schemaPath}`);
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);

  logger.info(`Seeding initial ERP data from ${seedPath}`);
  const seedSql = fs.readFileSync(seedPath, 'utf8');
  db.exec(seedSql);

  const orderCount = (db.prepare('SELECT COUNT(*) as count FROM orders').get() as { count: number }).count;
  const inventoryCount = (db.prepare('SELECT COUNT(*) as count FROM inventory').get() as { count: number }).count;
  const errorCount = (db.prepare('SELECT COUNT(*) as count FROM sync_error_logs').get() as { count: number }).count;
  const ticketCount = (db.prepare('SELECT COUNT(*) as count FROM support_tickets').get() as { count: number }).count;

  logger.info(`Database seeded successfully! Orders: ${orderCount}, Inventory: ${inventoryCount}, Errors: ${errorCount}, Tickets: ${ticketCount}`);
}

// Check if file is being run directly
if (process.argv[1] && process.argv[1].endsWith('seeder.ts')) {
  try {
    initAndSeedDatabase();
    process.exit(0);
  } catch (err) {
    logger.error('Database seeding failed:', err);
    process.exit(1);
  }
}
