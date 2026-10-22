import { Database as DatabaseType } from 'better-sqlite3';
import { ToolDefinition, ToolExecutionResult } from '../agent/agent.types.js';
import { createOrderTool } from './order.tool.js';
import { createInventoryTool } from './inventory.tool.js';
import { createErpErrorTool } from './erp-error.tool.js';
import { createEscalationTool } from './escalation.tool.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ToolRegistry');

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor(private db: DatabaseType) {
    this.registerStandardTools();
  }

  private registerStandardTools(): void {
    this.registerTool(createOrderTool(this.db));
    this.registerTool(createInventoryTool(this.db));
    this.registerTool(createErpErrorTool(this.db));
    this.registerTool(createEscalationTool(this.db));
  }

  public registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    logger.debug(`Registered tool: ${tool.name}`);
  }

  public getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  public async executeTool(name: string, args: Record<string, any>): Promise<ToolExecutionResult> {
    const tool = this.getTool(name);
    if (!tool) {
      return {
        success: false,
        data: null,
        error: `Tool '${name}' is not registered in ToolRegistry.`
      };
    }

    try {
      logger.info(`Executing tool '${name}' with args: ${JSON.stringify(args)}`);
      return await tool.execute(args);
    } catch (err: any) {
      logger.error(`Error during execution of tool '${name}':`, err);
      return {
        success: false,
        data: null,
        error: `Unhandled tool error in '${name}': ${err.message}`
      };
    }
  }

  /**
   * Formats the tool definitions for LLM tool calling (OpenAI / Gemini compatible).
   */
  public toLlmToolDeclarations(): any[] {
    return this.getAllTools().map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));
  }
}
