import { Database as DatabaseType } from 'better-sqlite3';
import { ToolDefinition, ToolExecutionResult } from '../agent/agent.types.js';
import { SqlSanitizer } from '../utils/sql-sanitizer.js';

export function createEscalationTool(db: DatabaseType): ToolDefinition {
  return {
    name: 'escalate_to_2nd_level',
    description: 'Escalates an unresolved or critical ERP issue to 2nd-level human engineering support, creating an official support ticket and optionally proposing a sanitized, safe SQL patch for data correction.',
    parameters: {
      type: 'object',
      properties: {
        customerQuery: {
          type: 'string',
          description: 'Original customer inquiry or reported system incident summary.'
        },
        diagnosis: {
          type: 'string',
          description: 'Technical root-cause diagnosis and recommended resolution plan for the 2nd-level engineer.'
        },
        sqlPatchSuggestion: {
          type: 'string',
          description: 'Optional safe SQL UPDATE/INSERT statement to rectify database inconsistency (e.g. adjust reserved_stock).'
        },
        source: {
          type: 'string',
          description: 'Origin of ticket: WEB_CHAT, N8N_WEBHOOK, or EMAIL',
          enum: ['WEB_CHAT', 'N8N_WEBHOOK', 'EMAIL']
        }
      },
      required: ['customerQuery', 'diagnosis']
    },
    execute: async (args: Record<string, any>): Promise<ToolExecutionResult> => {
      const { customerQuery, diagnosis, sqlPatchSuggestion, source = 'WEB_CHAT' } = args;

      if (!customerQuery || !diagnosis) {
        return {
          success: false,
          data: null,
          error: 'Missing required parameters: customerQuery and diagnosis are required.'
        };
      }

      let sanitizedPatch: string | null = null;

      if (sqlPatchSuggestion && sqlPatchSuggestion.trim() !== '') {
        const validation = SqlSanitizer.validatePatch(sqlPatchSuggestion);
        if (!validation.isValid) {
          return {
            success: false,
            data: null,
            error: `SQL Patch Security Rejection: ${validation.reason}`
          };
        }
        sanitizedPatch = validation.sanitizedSql || null;
      }

      const ticketId = `TCK-${Math.floor(100000 + Math.random() * 900000)}`;
      const createdAt = new Date().toISOString().replace('T', ' ').substring(0, 19);

      const sql = `
        INSERT INTO support_tickets (
          ticket_id, 
          created_at, 
          source, 
          customer_query, 
          assigned_level, 
          agent_summary, 
          recommended_sql_patch, 
          patch_executed, 
          resolution_status
        ) VALUES (?, ?, ?, ?, '2ND_LEVEL_ESCALATED', ?, ?, 0, 'IN_REVIEW')
      `;

      try {
        db.prepare(sql).run(
          ticketId,
          createdAt,
          source,
          customerQuery,
          diagnosis,
          sanitizedPatch
        );

        return {
          success: true,
          data: {
            ticketId,
            status: 'ESCALATED_TO_2ND_LEVEL',
            resolutionStatus: 'IN_REVIEW',
            assignedLevel: '2ND_LEVEL_ESCALATED',
            createdAt,
            hasSqlPatch: sanitizedPatch !== null,
            sanitizedPatch,
            message: `Ticket ${ticketId} created successfully. Escalated to 2nd-level engineering team with status IN_REVIEW.`
          },
          executedSql: `INSERT INTO support_tickets (ticket_id, assigned_level, recommended_sql_patch) VALUES ('${ticketId}', '2ND_LEVEL_ESCALATED', ${sanitizedPatch ? `'${sanitizedPatch}'` : 'NULL'})`
        };
      } catch (err: any) {
        return {
          success: false,
          data: null,
          error: `Failed to insert 2nd-level ticket: ${err.message}`,
          executedSql: sql
        };
      }
    }
  };
}
