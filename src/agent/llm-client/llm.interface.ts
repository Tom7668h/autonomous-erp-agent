import { AgentStepTrace, ToolCall, ToolDefinition } from '../agent.types.js';

export interface LLMNextStepDecision {
  thought: string;
  action?: ToolCall;
  finalAnswer?: string;
}

export interface ILLMClient {
  readonly providerName: string;
  generateNextStep(context: {
    systemPrompt: string;
    query: string;
    steps: AgentStepTrace[];
    availableTools: ToolDefinition[];
  }): Promise<LLMNextStepDecision>;
}
