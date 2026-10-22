import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../../src/server.js';
import { initAndSeedDatabase } from '../../src/db/seeder.js';

describe('ERP REST API Suite', () => {
  let app: any;
  let db: any;

  beforeAll(() => {
    db = new Database(':memory:');
    initAndSeedDatabase(db);
    const serverInstance = createApp(db);
    app = serverInstance.app;
  });

  it('GET /api/erp/inventory should return inventory with calculated available stock', async () => {
    const res = await request(app).get('/api/erp/inventory');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const sku7740 = res.body.find((i: any) => i.sku === 'SKU-7740');
    expect(sku7740).toBeDefined();
    expect(sku7740.available_stock).toBe(-4);
  });

  it('GET /api/erp/orders should return orders with item details', async () => {
    const res = await request(app).get('/api/erp/orders');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ord9821 = res.body.find((o: any) => o.order_id === 'ORD-9821');
    expect(ord9821).toBeDefined();
    expect(ord9821.items.length).toBeGreaterThan(0);
  });

  it('POST /api/erp/tickets/:id/apply-patch should execute sanitized patch safely and close ticket', async () => {
    // 1. Create ticket
    const ticketId = 'TCK-TEST-99';
    db.prepare(`
      INSERT INTO support_tickets (ticket_id, source, customer_query, assigned_level, agent_summary, recommended_sql_patch, resolution_status)
      VALUES (?, 'TEST', 'Query', '2ND_LEVEL_ESCALATED', 'Diagnosis', 'UPDATE inventory SET reserved_stock = 10 WHERE sku = ''SKU-7740''', 'IN_REVIEW')
    `).run(ticketId);

    // 2. Apply patch via API
    const res = await request(app).post(`/api/erp/tickets/${ticketId}/apply-patch`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // 3. Verify DB state: reserved_stock is now 10, available_stock is now 0 (10 - 10)
    const updatedItem = db.prepare("SELECT * FROM inventory WHERE sku = 'SKU-7740'").get() as any;
    expect(updatedItem.reserved_stock).toBe(10);
    expect(updatedItem.available_stock).toBe(0);

    // 4. Verify ticket closed
    const ticket = db.prepare('SELECT * FROM support_tickets WHERE ticket_id = ?').get(ticketId) as any;
    expect(ticket.patch_executed).toBe(1);
    expect(ticket.resolution_status).toBe('CLOSED');
  });

  it('POST /api/erp/tickets/:id/apply-patch should reject forbidden statements', async () => {
    const ticketId = 'TCK-BAD-01';
    db.prepare(`
      INSERT INTO support_tickets (ticket_id, source, customer_query, assigned_level, agent_summary, recommended_sql_patch, resolution_status)
      VALUES (?, 'TEST', 'Query', '2ND_LEVEL_ESCALATED', 'Diagnosis', 'DROP TABLE inventory', 'IN_REVIEW')
    `).run(ticketId);

    const res = await request(app).post(`/api/erp/tickets/${ticketId}/apply-patch`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Refusing execution');
  });
});
