import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { getDatabase } from './db/database.js';
import { initAndSeedDatabase } from './db/seeder.js';
import { ToolRegistry } from './tools/tool.registry.js';
import { MockLlmClient } from './agent/llm-client/mock-llm.client.js';
import { OpenAiGeminiClient } from './agent/llm-client/openai-gemini.client.js';
import { AgentEngine } from './agent/agent.engine.js';
import { createAgentRoutes } from './routes/agent.routes.js';
import { createErpRoutes } from './routes/erp.routes.js';
import { createWebhookRoutes } from './routes/webhook.routes.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('Server');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export function createApp(customDb?: any) {
  const app = express();
  const db = customDb || getDatabase();

  // Initialize and seed DB if empty
  try {
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'").get();
    if (!tableCheck) {
      logger.info('Database empty. Initializing schema and seed data...');
      initAndSeedDatabase(db);
    }
  } catch (e) {
    initAndSeedDatabase(db);
  }

  // Agent Engine initialization
  const registry = new ToolRegistry(db);
  const llmClient = env.llmProvider === 'mock' ? new MockLlmClient() : new OpenAiGeminiClient();
  const engine = new AgentEngine(llmClient, registry, 5);

  app.use(cors());
  app.use(express.json());

  // Static Frontend Assets
  app.use(express.static(path.resolve(rootDir, 'public')));

  // API Routes
  app.use('/api/agent', createAgentRoutes(engine, registry));
  app.use('/api/erp', createErpRoutes(db));
  app.use('/api/webhook', createWebhookRoutes(engine));

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      time: new Date().toISOString(),
      provider: engine.getLlmClient().providerName
    });
  });

  return { app, db, engine, registry };
}

// Start server if executed directly
if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  const { app } = createApp();
  app.listen(env.port, () => {
    logger.info(`Autonomous ERP Agent Server running at http://localhost:${env.port}`);
    logger.info(`Web-Playground available at http://localhost:${env.port}`);
    logger.info(`LLM Provider Mode: ${env.llmProvider}`);
  });
}
