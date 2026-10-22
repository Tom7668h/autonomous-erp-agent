import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database, { Database as DatabaseType } from 'better-sqlite3';
import { initAndSeedDatabase } from '../../src/db/seeder.js';
import { ToolRegistry } from '../../src/tools/tool.registry.js';
import { MockLlmClient } from '../../src/agent/llm-client/mock-llm.client.js';
import { AgentEngine } from '../../src/agent/agent.engine.js';

describe('ReAct Agent Loop Integration', () => {
  let db: DatabaseType;
  let registry: ToolRegistry;
  let mockLlm: MockLlmClient;
  let engine: AgentEngine;

  beforeAll(() => {
    db = new Database(':memory:');
    initAndSeedDatabase(db);
    registry = new ToolRegistry(db);
    mockLlm = new MockLlmClient();
    engine = new AgentEngine(mockLlm, registry, 5);
  });

  afterAll(() => {
    db.close();
  });

  it('should execute complete 4-turn ReAct investigation for ORD-9821 including 2nd-level ticket & SQL patch', async () => {
    const response = await engine.processQuery('Lieferverzögerung bei Auftrag ORD-9821 prüfen und beheben');

    expect(response.sessionId).toBeDefined();
    expect(response.steps.length).toBeGreaterThanOrEqual(4);
    expect(response.finalAnswer).toContain('ORD-9821');
    expect(response.finalAnswer).toContain('ERR_SQL_DEADLOCK_40001');

    // Verify tools executed in sequence
    const toolNames = response.steps.map(s => s.action?.toolName).filter(Boolean);
    expect(toolNames).toContain('lookup_order_status');
    expect(toolNames).toContain('analyze_erp_sync_error');
    expect(toolNames).toContain('check_inventory_and_supplier_feed');
    expect(toolNames).toContain('escalate_to_2nd_level');

    // Verify escalation ticket and suggested SQL patch
    expect(response.escalationTicketId).toMatch(/^TCK-\d+/);
    expect(response.suggestedSqlPatch).toContain('UPDATE inventory SET reserved_stock = 10');

    // Verify ticket exists in DB
    const ticket = db.prepare('SELECT * FROM support_tickets WHERE ticket_id = ?').get(response.escalationTicketId) as any;
    expect(ticket).toBeDefined();
    expect(ticket.assigned_level).toBe('2ND_LEVEL_ESCALATED');
    expect(ticket.resolution_status).toBe('IN_REVIEW');
  });

  it('should answer simple tracking inquiry for ORD-4412 in 2 steps', async () => {
    const response = await engine.processQuery('Sendungsstatus für Auftrag ORD-4412 prüfen');

    expect(response.steps.length).toBe(2);
    expect(response.finalAnswer).toContain('DHL Freight');
    expect(response.finalAnswer).toContain('DHL-DE-9938210481');
  });
});
