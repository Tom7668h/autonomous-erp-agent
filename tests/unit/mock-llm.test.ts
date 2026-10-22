import { describe, it, expect } from 'vitest';
import { MockLlmClient } from '../../src/agent/llm-client/mock-llm.client.js';

describe('MockLlmClient', () => {
  const client = new MockLlmClient();

  it('should identify ORD-9821 inquiry and trigger lookup_order_status as turn 1', async () => {
    const decision = await client.generateNextStep({
      systemPrompt: 'System',
      query: 'Kunde fragt nach Lieferverzögerung für ORD-9821',
      steps: [],
      availableTools: []
    });

    expect(decision.thought).toContain('ORD-9821');
    expect(decision.action).toBeDefined();
    expect(decision.action?.toolName).toBe('lookup_order_status');
    expect(decision.action?.input.orderId).toBe('ORD-9821');
  });

  it('should trigger analyze_erp_sync_error on turn 2 for ORD-9821', async () => {
    const decision = await client.generateNextStep({
      systemPrompt: 'System',
      query: 'Kunde fragt nach Lieferverzögerung für ORD-9821',
      steps: [
        {
          step: 1,
          thought: 'Turn 1 thought',
          action: { toolName: 'lookup_order_status', input: { orderId: 'ORD-9821' } }
        }
      ],
      availableTools: []
    });

    expect(decision.action?.toolName).toBe('analyze_erp_sync_error');
    expect(decision.action?.input.entityId).toBe('ORD-9821');
  });

  it('should trigger lookup_order_status for ORD-4412 tracking inquiry', async () => {
    const decision = await client.generateNextStep({
      systemPrompt: 'System',
      query: 'Sendungsstatus für Auftrag ORD-4412 abfragen',
      steps: [],
      availableTools: []
    });

    expect(decision.action?.toolName).toBe('lookup_order_status');
    expect(decision.action?.input.orderId).toBe('ORD-4412');
  });
});
