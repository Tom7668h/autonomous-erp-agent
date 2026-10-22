import { Router, Request, Response } from 'express';
import { Database as DatabaseType } from 'better-sqlite3';
import { SqlSanitizer } from '../utils/sql-sanitizer.js';
import { initAndSeedDatabase } from '../db/seeder.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ErpRoutes');

export function createErpRoutes(db: DatabaseType): Router {
  const router = Router();

  // GET all inventory items
  router.get('/inventory', (_req: Request, res: Response) => {
    try {
      const items = db.prepare(`
        SELECT 
          sku,
          description,
          physical_stock,
          reserved_stock,
          (physical_stock - reserved_stock) AS available_stock,
          warehouse_bin,
          min_safety_stock,
          supplier_eta,
          supplier_incoming_qty
        FROM inventory
        ORDER BY sku ASC
      `).all();
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET all orders with items
  router.get('/orders', (_req: Request, res: Response) => {
    try {
      const orders = db.prepare(`
        SELECT 
          o.order_id,
          o.customer_id,
          o.customer_name,
          o.order_date,
          o.status,
          o.tracking_carrier,
          o.tracking_code,
          o.erp_sync_status,
          o.total_amount,
          json_group_array(
            json_object(
              'sku', i.sku,
              'quantity', i.quantity,
              'unit_price', i.unit_price
            )
          ) AS items_json
        FROM orders o
        LEFT JOIN order_items i ON o.order_id = i.order_id
        GROUP BY o.order_id
        ORDER BY o.order_date DESC
      `).all() as any[];

      const formatted = orders.map(o => ({
        ...o,
        items: o.items_json ? JSON.parse(o.items_json) : []
      }));

      res.json(formatted);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET all sync error logs
  router.get('/errors', (_req: Request, res: Response) => {
    try {
      const errors = db.prepare('SELECT * FROM sync_error_logs ORDER BY occurred_at DESC').all();
      res.json(errors);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET all support tickets
  router.get('/tickets', (_req: Request, res: Response) => {
    try {
      const tickets = db.prepare('SELECT * FROM support_tickets ORDER BY created_at DESC').all();
      res.json(tickets);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Apply SQL patch proposed by Agent
  router.post('/tickets/:id/apply-patch', (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      const ticket = db.prepare('SELECT * FROM support_tickets WHERE ticket_id = ?').get(id) as any;

      if (!ticket) {
        res.status(404).json({ error: `Ticket with ID '${id}' not found.` });
        return;
      }

      if (!ticket.recommended_sql_patch) {
        res.status(400).json({ error: `Ticket '${id}' does not have any proposed SQL patch.` });
        return;
      }

      if (ticket.patch_executed === 1) {
        res.status(400).json({ error: `SQL patch for ticket '${id}' has already been executed.` });
        return;
      }

      // Security check
      const validation = SqlSanitizer.validatePatch(ticket.recommended_sql_patch);
      if (!validation.isValid) {
        res.status(403).json({ error: `Refusing execution: ${validation.reason}` });
        return;
      }

      logger.info(`Applying 2nd-level approved SQL patch for ticket ${id}: ${validation.sanitizedSql}`);

      // Execute within safe transaction
      const applyTransaction = db.transaction(() => {
        db.exec(validation.sanitizedSql!);

        // Mark ticket executed and closed
        db.prepare(`
          UPDATE support_tickets 
          SET patch_executed = 1, resolution_status = 'CLOSED' 
          WHERE ticket_id = ?
        `).run(id);

        // If the patch was on SKU-7740 or ORD-9821, mark corresponding errors resolved
        if (validation.sanitizedSql!.includes('SKU-7740')) {
          db.prepare("UPDATE sync_error_logs SET resolved = 1 WHERE entity_id = 'SKU-7740'").run();
        }
        if (validation.sanitizedSql!.includes('ORD-9821')) {
          db.prepare("UPDATE sync_error_logs SET resolved = 1 WHERE entity_id = 'ORD-9821'").run();
          db.prepare("UPDATE orders SET erp_sync_status = 'SYNCED', status = 'PROCESSING' WHERE order_id = 'ORD-9821'").run();
        }
      });

      applyTransaction();

      res.json({
        success: true,
        message: `SQL patch for ticket ${id} executed successfully. Database state updated.`,
        ticketId: id,
        executedSql: validation.sanitizedSql
      });
    } catch (err: any) {
      logger.error(`Failed to apply patch for ticket ${id}:`, err);
      res.status(500).json({ error: `Transaction execution failed: ${err.message}` });
    }
  });

  // Reset & Re-seed database
  router.post('/reset', (_req: Request, res: Response) => {
    try {
      initAndSeedDatabase(db);
      res.json({ success: true, message: 'Database reset to initial demo state.' });
    } catch (err: any) {
      res.status(500).json({ error: `Database reset failed: ${err.message}` });
    }
  });

  return router;
}
