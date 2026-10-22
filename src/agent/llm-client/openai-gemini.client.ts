import { ILLMClient, LLMNextStepDecision } from './llm.interface.js';
import { AgentStepTrace, ToolDefinition } from '../agent.types.js';
import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { MockLlmClient } from './mock-llm.client.js';

const logger = createLogger('OpenAiGeminiClient');

export class OpenAiGeminiClient implements ILLMClient {
  readonly providerName: string;
  private fallbackMock: MockLlmClient;

  constructor() {
    this.providerName = env.llmProvider === 'gemini' ? 'Gemini-API' : 'OpenAI-API';
    this.fallbackMock = new MockLlmClient();
  }

  async generateNextStep(context: {
    systemPrompt: string;
    query: string;
    steps: AgentStepTrace[];
    availableTools: ToolDefinition[];
  }): Promise<LLMNextStepDecision> {
    const apiKey = env.llmProvider === 'gemini' ? env.geminiApiKey : env.openaiApiKey;

    if (!apiKey) {
      logger.warn(`No API key provided for ${this.providerName}. Falling back to deterministic Mock engine.`);
      return this.fallbackMock.generateNextStep(context);
    }

    try {
      if (env.llmProvider === 'gemini') {
        return await this.callGeminiApi(apiKey, context);
      } else {
        return await this.callOpenAiApi(apiKey, context);
      }
    } catch (err: any) {
      logger.error(`Live LLM API call failed (${err.message}). Using mock fallback.`, err);
      return this.fallbackMock.generateNextStep(context);
    }
  }

  private async callOpenAiApi(apiKey: string, context: {
    systemPrompt: string;
    query: string;
    steps: AgentStepTrace[];
    availableTools: ToolDefinition[];
  }): Promise<LLMNextStepDecision> {
    const messages: any[] = [
      { role: 'system', content: context.systemPrompt },
      { role: 'user', content: context.query }
    ];

    for (const step of context.steps) {
      if (step.thought) {
        messages.push({ role: 'assistant', content: `Thought: ${step.thought}` });
      }
      if (step.action) {
        messages.push({
          role: 'assistant',
          tool_calls: [
            {
              id: `call_${step.step}`,
              type: 'function',
              function: {
                name: step.action.toolName,
                arguments: JSON.stringify(step.action.input)
              }
            }
          ]
        });
      }
      if (step.observation) {
        messages.push({
          role: 'tool',
          tool_call_id: `call_${step.step}`,
          content: JSON.stringify(step.observation.result)
        });
      }
    }

    const tools = context.availableTools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: env.openaiModel,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error [${response.status}]: ${errorText}`);
    }

    const data: any = await response.json();
    const choice = data.choices?.[0]?.message;

    if (!choice) {
      throw new Error('No choice returned from OpenAI API.');
    }

    if (choice.tool_calls && choice.tool_calls.length > 0) {
      const toolCall = choice.tool_calls[0];
      let args = {};
      try {
        args = JSON.parse(toolCall.function.arguments || '{}');
      } catch (e) {
        // keep empty
      }
      return {
        thought: choice.content || `Calling tool ${toolCall.function.name}`,
        action: {
          toolName: toolCall.function.name,
          input: args
        }
      };
    }

    return {
      thought: 'Final conclusion reached.',
      finalAnswer: choice.content || 'Keine Antwort erhalten.'
    };
  }

  private async callGeminiApi(apiKey: string, context: {
    systemPrompt: string;
    query: string;
    steps: AgentStepTrace[];
    availableTools: ToolDefinition[];
  }): Promise<LLMNextStepDecision> {
    // Gemini OpenAI compatibility endpoint or native fallback
    const url = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;
    const messages = [
      { role: 'system', content: context.systemPrompt },
      { role: 'user', content: context.query }
    ];

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: env.geminiModel,
        messages,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error [${response.status}]: ${err}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    return {
      thought: 'Gemini reasoning complete.',
      finalAnswer: content
    };
  }
}
