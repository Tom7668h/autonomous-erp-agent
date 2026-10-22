import { Database as DatabaseType } from 'better-sqlite3';
import { ToolDefinition, ToolExecutionResult } from '../agent/agent.types.js';

export function createErpErrorTool(db: DatabaseType): ToolDefinition {
  return {
    name: 'analyze_erp_sync_error',
    description: 'Diagnoses ERP and Wawi synchronization errors by analyzing error logs, error codes (e.g. ERR_SQL_DEADLOCK_40001, ERR_INVENTORY_NEGATIVE_RESERVATION), stack traces, and affected entities.',
    parameters: {
      type: 'object',
      properties: {
        errorCode: {
          type: 'string',
          description: 'The error code to look up (e.g., ERR_SQL_DEADLOCK_40001, ERR_INVALID_EAN_CHECK_SUM)'
        },
        entityId: {
          type: 'string',
          description: 'The ID of the affected order or SKU (e.g., ORD-9821, SKU-7740)'
        }
      },
      required: []
    },
    execute: async (args: { errorCode?: string; entityId?: string }): Promise<ToolExecutionResult> => {
      const { errorCode, entityId } = args;

      if (!errorCode && !entityId) {
        return {
          success: false,
          data: null,
          error: 'At least one parameter (errorCode or entityId) must be provided.'
        };
      }

      let sql = 'SELECT * FROM sync_error_logs WHERE ';
      const params: any[] = [];

      if (errorCode && entityId) {
        sql += '(error_code = ? OR entity_id = ?)';
        params.push(errorCode.trim(), entityId.trim());
      } else if (errorCode) {
        sql += 'error_code = ?';
        params.push(errorCode.trim());
      } else {
        sql += 'entity_id = ?';
        params.push(entityId!.trim());
      }

      sql += ' ORDER BY occurred_at DESC LIMIT 5';

      try {
        const rows = db.prepare(sql).all(...params) as any[];

        if (!rows || rows.length === 0) {
          return {
            success: true,
            data: {
              found: false,
              message: `No sync error logs found matching errorCode='${errorCode || ''}', entityId='${entityId || ''}'.`,
              errors: []
            },
            executedSql: sql.replace(/\?/g, () => `'${params.shift()}'`)
          };
        }

        const analyzedErrors = rows.map(r => {
          let rootCause = 'Unknown ERP Synchronization Failure';
          let remediation = 'Investigate system integration logs';

          if (r.error_code.includes('DEADLOCK') || r.error_code.includes('40001')) {
            rootCause = 'Database transaction concurrency conflict (SQL Deadlock). Simultaneous stock reservation and order placement created a lock cycle.';
            remediation = '1) Verify whether order was partially written. 2) Reconcile reserved stock counter. 3) Re-trigger ERP order sync job.';
          } else if (r.error_code.includes('NEGATIVE_RESERVATION') || r.error_code.includes('INVENTORY')) {
            rootCause = 'Inventory integrity constraint violation. Reserved stock counter exceeded physical on-hand quantity due to unsynchronized order cancellations.';
            remediation = 'Generate SQL patch to correct reserved_stock to match actual open orders or physical threshold.';
          } else if (r.error_code.includes('EAN') || r.error_code.includes('CHECK_SUM')) {
            rootCause = 'EAN barcode check digit error. Standard GS1 Modulo-10 checksum failed validation in export pipeline.';
            remediation = 'Verify GS1 13th digit against official manufacturer datasheet and update catalog registry.';
          }

          return {
            errorId: r.error_id,
            errorCode: r.error_code,
            affectedEntityType: r.affected_entity_type,
            entityId: r.entity_id,
            errorMessage: r.error_message,
            stackTrace: r.stack_trace,
            occurredAt: r.occurred_at,
            isResolved: r.resolved === 1,
            diagnosis: {
              rootCause,
              remediation
            }
          };
        });

        return {
          success: true,
          data: {
            found: true,
            count: analyzedErrors.length,
            errors: analyzedErrors
          },
          executedSql: `SELECT * FROM sync_error_logs WHERE error_code = '${errorCode || ''}' OR entity_id = '${entityId || ''}' ORDER BY occurred_at DESC`
        };
      } catch (err: any) {
        return {
          success: false,
          data: null,
          error: `Error querying sync error logs: ${err.message}`,
          executedSql: sql
        };
      }
    }
  };
}
