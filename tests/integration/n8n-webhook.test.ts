import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../../src/server.js';
import { initAndSeedDatabase } from '../../src/db/seeder.js';

describe('n8n Webhook Integration Endpoint', () => {
  let app: any;
  let db: any;

  beforeAll(() => {
    db = new Database(':memory:');
    initAndSeedDatabase(db);
    const serverInstance = createApp(db);
    app = serverInstance.app;
  });

  it('should process webhook support query and return structured response for n8n', async () => {
    const payload = {
      event: 'customer_support_request',
      customerQuery: 'Lieferverzögerung bei Auftrag ORD-9821 prüfen',
      externalTicketId: 'N8N-TEST-999',
      source: 'N8N_WEBHOOK'
    };

    const res = await request(app)
      .post('/api/webhook/n8n/support-ticket')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.externalTicketId).toBe('N8N-TEST-999');
    expect(res.body.needsHumanReview).toBe(true);
    expect(res.body.escalationTicketId).toMatch(/^TCK-\d+/);
    expect(res.body.suggestedSqlPatch).toContain('UPDATE inventory');
  });

  it('should reject webhook request missing query', async () => {
    const res = await request(app)
      .post('/api/webhook/n8n/support-ticket')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
  });
});
