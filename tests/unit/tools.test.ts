import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database, { Database as DatabaseType } from 'better-sqlite3';
import { initAndSeedDatabase } from '../../src/db/seeder.js';
import { ToolRegistry } from '../../src/tools/tool.registry.js';

describe('ERP SQL Tools Suite', () => {
  let db: DatabaseType;
  let registry: ToolRegistry;

  beforeAll(() => {
    db = new Database(':memory:');
    initAndSeedDatabase(db);
    registry = new ToolRegistry(db);
  });

  afterAll(() => {
    db.close();
  });

  describe('lookup_order_status', () => {
    it('should retrieve existing order with line items and sync state', async () => {
      const res = await registry.executeTool('lookup_order_status', { orderId: 'ORD-9821' });
      expect(res.success).toBe(true);
      expect(res.data.orderId).toBe('ORD-9821');
      expect(res.data.customerName).toContain('Müller');
      expect(res.data.hasSyncIssue).toBe(true);
      expect(res.data.items).toHaveLength(1);
      expect(res.data.items[0].sku).toBe('SKU-7740');
      expect(res.executedSql).toBeDefined();
    });

    it('should return error for non-existent order', async () => {
      const res = await registry.executeTool('lookup_order_status', { orderId: 'ORD-UNKNOWN' });
      expect(res.success).toBe(false);
      expect(res.error).toContain('not found');
    });
  });

  describe('check_inventory_and_supplier_feed', () => {
    it('should detect critical overbooking for SKU-7740', async () => {
      const res = await registry.executeTool('check_inventory_and_supplier_feed', { sku: 'SKU-7740' });
      expect(res.success).toBe(true);
      expect(res.data.physicalStock).toBe(10);
      expect(res.data.reservedStock).toBe(14);
      expect(res.data.availableStock).toBe(-4);
      expect(res.data.statusSummary.isOverbooked).toBe(true);
      expect(res.data.statusSummary.shortageAmount).toBe(4);
      expect(res.data.warehouseBin).toBe('H-03-12');
      expect(res.data.supplierIncomingQty).toBe(20);
    });

    it('should return regular stock data for healthy item', async () => {
      const res = await registry.executeTool('check_inventory_and_supplier_feed', { sku: 'SKU-1022' });
      expect(res.success).toBe(true);
      expect(res.data.statusSummary.isOverbooked).toBe(false);
      expect(res.data.availableStock).toBe(19);
    });
  });

  describe('analyze_erp_sync_error', () => {
    it('should find and diagnose deadlock error for ORD-9821', async () => {
      const res = await registry.executeTool('analyze_erp_sync_error', { entityId: 'ORD-9821' });
      expect(res.success).toBe(true);
      expect(res.data.found).toBe(true);
      expect(res.data.errors[0].errorCode).toBe('ERR_SQL_DEADLOCK_40001');
      expect(res.data.errors[0].diagnosis.rootCause).toContain('concurrency conflict');
    });

    it('should diagnose EAN check sum failure', async () => {
      const res = await registry.executeTool('analyze_erp_sync_error', { errorCode: 'ERR_INVALID_EAN_CHECK_SUM' });
      expect(res.success).toBe(true);
      expect(res.data.found).toBe(true);
      expect(res.data.errors[0].diagnosis.rootCause).toContain('Modulo-10');
    });
  });

  describe('escalate_to_2nd_level', () => {
    it('should create a 2nd-level ticket with validated SQL patch', async () => {
      const patch = "UPDATE inventory SET reserved_stock = 10 WHERE sku = 'SKU-7740'";
      const res = await registry.executeTool('escalate_to_2nd_level', {
        customerQuery: 'Kunde meldet Lieferverzögerung für ORD-9821.',
        diagnosis: 'Kritische Überbuchung festgestellt. Reservierung korrigieren.',
        sqlPatchSuggestion: patch
      });

      expect(res.success).toBe(true);
      expect(res.data.ticketId).toMatch(/^TCK-\d+/);
      expect(res.data.hasSqlPatch).toBe(true);
      expect(res.data.sanitizedPatch).toBe(patch);

      // Verify in DB
      const ticket = db.prepare('SELECT * FROM support_tickets WHERE ticket_id = ?').get(res.data.ticketId) as any;
      expect(ticket).toBeDefined();
      expect(ticket.assigned_level).toBe('2ND_LEVEL_ESCALATED');
      expect(ticket.recommended_sql_patch).toBe(patch);
    });

    it('should reject unsafe SQL patch during escalation', async () => {
      const unsafePatch = "DROP TABLE inventory";
      const res = await registry.executeTool('escalate_to_2nd_level', {
        customerQuery: 'Test Inquiry',
        diagnosis: 'Unsafe test',
        sqlPatchSuggestion: unsafePatch
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('SQL Patch Security Rejection');
    });
  });
});
