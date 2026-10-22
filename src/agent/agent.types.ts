export interface ToolParameterSchema {
  type: string;
  description: string;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required: string[];
  };
  execute: (args: Record<string, any>) => Promise<ToolExecutionResult>;
}

export interface ToolExecutionResult {
  success: boolean;
  data: any;
  error?: string;
  executedSql?: string; // Transparent display of executed query in trace
}

export interface ToolCall {
  toolName: string;
  input: Record<string, any>;
}

export interface AgentStepTrace {
  step: number;
  thought: string;
  action?: ToolCall;
  observation?: {
    success: boolean;
    result: any;
    executedSql?: string;
    error?: string;
  };
}

export interface AgentResponse {
  sessionId: string;
  finalAnswer: string;
  steps: AgentStepTrace[];
  escalationTicketId?: string;
  suggestedSqlPatch?: string;
  metrics: {
    turnsCount: number;
    durationMs: number;
    llmProvider: string;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResult?: ToolExecutionResult;
}
