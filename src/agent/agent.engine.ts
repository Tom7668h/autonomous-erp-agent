import { AgentResponse, AgentStepTrace } from './agent.types.js';
import { ToolRegistry } from '../tools/tool.registry.js';
import { ILLMClient } from './llm-client/llm.interface.js';
import { ERP_SYSTEM_PROMPT } from './prompt.templates.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AgentEngine');

export class AgentEngine {
  constructor(
    private llmClient: ILLMClient,
    private toolRegistry: ToolRegistry,
    private maxTurns: number = 5
  ) {}

  public setLlmClient(client: ILLMClient): void {
    this.llmClient = client;
  }

  public getLlmClient(): ILLMClient {
    return this.llmClient;
  }

  async processQuery(query: string, sessionId?: string): Promise<AgentResponse> {
    const startTime = Date.now();
    const effectiveSessionId = sessionId || `SES-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    const steps: AgentStepTrace[] = [];
    const availableTools = this.toolRegistry.getAllTools();

    let finalAnswer = '';
    let escalationTicketId: string | undefined;
    let suggestedSqlPatch: string | undefined;

    logger.info(`Starting ReAct session [${effectiveSessionId}] for query: "${query}" using provider [${this.llmClient.providerName}]`);

    for (let turn = 1; turn <= this.maxTurns; turn++) {
      logger.debug(`ReAct Turn ${turn}/${this.maxTurns} for session ${effectiveSessionId}`);

      const decision = await this.llmClient.generateNextStep({
        systemPrompt: ERP_SYSTEM_PROMPT,
        query,
        steps,
        availableTools
      });

      // Case A: The LLM chooses an Action (Tool Call)
      if (decision.action) {
        const toolResult = await this.toolRegistry.executeTool(
          decision.action.toolName,
          decision.action.input
        );

        // Check if escalation tool was executed
        if (decision.action.toolName === 'escalate_to_2nd_level' && toolResult.success && toolResult.data?.ticketId) {
          escalationTicketId = toolResult.data.ticketId;
          suggestedSqlPatch = toolResult.data.sanitizedPatch || undefined;
        }

        const stepTrace: AgentStepTrace = {
          step: turn,
          thought: decision.thought,
          action: decision.action,
          observation: {
            success: toolResult.success,
            result: toolResult.data,
            executedSql: toolResult.executedSql,
            error: toolResult.error
          }
        };

        steps.push(stepTrace);

        // If the decision also provided a final answer along with the action, or if it was the last turn
        if (decision.finalAnswer) {
          finalAnswer = decision.finalAnswer;
          break;
        }
      } 
      // Case B: The LLM reached a Final Answer directly
      else if (decision.finalAnswer) {
        steps.push({
          step: turn,
          thought: decision.thought || 'Abschließende Lösung abgeleitet.'
        });
        finalAnswer = decision.finalAnswer;
        break;
      } 
      // Case C: Neither action nor final answer provided
      else {
        steps.push({
          step: turn,
          thought: decision.thought || 'Keine weitere Aktion bestimmt.'
        });
        finalAnswer = 'Die Analyse wurde ohne weitere Aktionen beendet.';
        break;
      }
    }

    // Fallback if maxTurns reached without explicit finalAnswer
    if (!finalAnswer) {
      finalAnswer = 'Die maximale Anzahl an ReAct-Analyseschritten wurde erreicht. Die ermittelten Zwischenergebnisse wurden erfasst.';
    }

    const durationMs = Date.now() - startTime;

    return {
      sessionId: effectiveSessionId,
      finalAnswer,
      steps,
      escalationTicketId,
      suggestedSqlPatch,
      metrics: {
        turnsCount: steps.length,
        durationMs,
        llmProvider: this.llmClient.providerName
      }
    };
  }
}
