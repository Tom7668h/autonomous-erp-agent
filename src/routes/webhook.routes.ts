import { Router, Request, Response } from 'express';
import { AgentEngine } from '../agent/agent.engine.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('WebhookRoutes');

export function createWebhookRoutes(engine: AgentEngine): Router {
  const router = Router();

  /**
   * n8n Webhook Ingestion Endpoint
   * Expects payload:
   * {
   *   "event": "customer_support_request" | "erp_alert",
   *   "customerQuery": "...",
   *   "source": "EMAIL" | "N8N_WEBHOOK" | "TICKET_SYSTEM",
   *   "externalTicketId": "EXT-10928"
   * }
   */
  router.post('/n8n/support-ticket', async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      logger.info('Received n8n webhook payload:', payload);

      const customerQuery = payload.customerQuery || payload.query || payload.message;

      if (!customerQuery) {
        res.status(400).json({
          status: 'error',
          error: 'Missing required field: "customerQuery" or "query" in webhook payload.'
        });
        return;
      }

      const externalTicketId = payload.externalTicketId || `EXT-${Date.now().toString().slice(-5)}`;
      const sessionId = `N8N-${externalTicketId}`;

      const agentResponse = await engine.processQuery(customerQuery, sessionId);

      const webhookResponse = {
        status: 'success',
        processedBy: 'Autonomous ERP Agent',
        externalTicketId,
        sessionId: agentResponse.sessionId,
        finalAnswer: agentResponse.finalAnswer,
        needsHumanReview: !!agentResponse.escalationTicketId,
        escalationTicketId: agentResponse.escalationTicketId || null,
        suggestedSqlPatch: agentResponse.suggestedSqlPatch || null,
        metrics: agentResponse.metrics,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(webhookResponse);
    } catch (err: any) {
      logger.error('Error handling n8n webhook:', err);
      res.status(500).json({
        status: 'error',
        error: `Webhook processing failed: ${err.message}`
      });
    }
  });

  return router;
}
