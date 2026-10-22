import { Router, Request, Response } from 'express';
import { AgentEngine } from '../agent/agent.engine.js';
import { ToolRegistry } from '../tools/tool.registry.js';
import { MockLlmClient } from '../agent/llm-client/mock-llm.client.js';
import { OpenAiGeminiClient } from '../agent/llm-client/openai-gemini.client.js';
import { env } from '../config/env.js';

export function createAgentRoutes(engine: AgentEngine, registry: ToolRegistry): Router {
  const router = Router();

  const mockClient = new MockLlmClient();
  const liveClient = new OpenAiGeminiClient();

  router.post('/chat', async (req: Request, res: Response) => {
    try {
      const { query, sessionId, provider } = req.body;

      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'Field "query" is required.' });
        return;
      }

      // Allow runtime selection of LLM provider
      if (provider === 'openai' || provider === 'gemini') {
        engine.setLlmClient(liveClient);
      } else {
        engine.setLlmClient(mockClient);
      }

      const response = await engine.processQuery(query, sessionId);
      res.json(response);
    } catch (err: any) {
      res.status(500).json({ error: `Internal Agent Error: ${err.message}` });
    }
  });

  router.post('/scenario', async (req: Request, res: Response) => {
    try {
      const { scenarioId } = req.body;

      const scenarioPrompts: Record<string, string> = {
        scenario_1_overbooking: 'Lieferverzögerung bei Auftrag ORD-9821 analysieren und beheben.',
        scenario_2_tracking: 'Sendungsstatus und Tracking für Auftrag ORD-4412 abfragen.',
        scenario_3_inventory: 'Lagerbestand und Lieferanten-ETA für SKU-7740 prüfen.',
        scenario_4_ean: 'Synchronisationsfehler ERR_INVALID_EAN_CHECK_SUM diagnostizieren.'
      };

      const prompt = scenarioPrompts[scenarioId] || scenarioPrompts.scenario_1_overbooking;
      engine.setLlmClient(mockClient);

      const response = await engine.processQuery(prompt, `SCENARIO-${scenarioId.toUpperCase()}`);
      res.json(response);
    } catch (err: any) {
      res.status(500).json({ error: `Scenario execution failed: ${err.message}` });
    }
  });

  router.get('/config', (_req: Request, res: Response) => {
    res.json({
      defaultProvider: env.llmProvider,
      activeProvider: engine.getLlmClient().providerName,
      openaiConfigured: !!env.openaiApiKey,
      geminiConfigured: !!env.geminiApiKey,
      tools: registry.getAllTools().map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    });
  });

  return router;
}
