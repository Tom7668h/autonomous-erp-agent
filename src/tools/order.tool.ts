import { Database as DatabaseType } from 'better-sqlite3';
import { ToolDefinition, ToolExecutionResult } from '../agent/agent.types.js';

export function createOrderTool(db: DatabaseType): ToolDefinition {
  return {
    name: 'lookup_order_status',
    description: 'Looks up the complete ERP order header, customer details, line items, shipping carrier, tracking code, and ERP synchronization status for a given order ID (e.g., ORD-9821).',
    parameters: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: 'The unique ERP Order ID, such as ORD-9821 or ORD-4412'
        }
      },
      required: ['orderId']
    },
    execute: async (args: Record<string, any>): Promise<ToolExecutionResult> => {
      const orderId = args.orderId?.trim();
      if (!orderId) {
        return {
          success: false,
          data: null,
          error: 'Missing required parameter: orderId'
        };
      }

      const sql = `
        SELECT 
          o.order_id,
          o.customer_id,
          o.customer_name,
          o.order_date,
          o.status,
          o.tracking_carrier,
          o.tracking_code,
          o.erp_sync_status,
          o.total_amount,
          json_group_array(
            json_object(
              'sku', i.sku,
              'description', inv.description,
              'quantity', i.quantity,
              'unit_price', i.unit_price,
              'warehouse_bin', inv.warehouse_bin
            )
          ) AS items_json
        FROM orders o
        LEFT JOIN order_items i ON o.order_id = i.order_id
        LEFT JOIN inventory inv ON i.sku = inv.sku
        WHERE o.order_id = ?
        GROUP BY o.order_id
      `;

      try {
        const row = db.prepare(sql).get(orderId) as any;

        if (!row) {
          return {
            success: false,
            data: null,
            error: `Order with ID '${orderId}' not found in ERP database.`,
            executedSql: `SELECT * FROM orders WHERE order_id = '${orderId}'`
          };
        }

        const items = row.items_json ? JSON.parse(row.items_json) : [];

        return {
          success: true,
          data: {
            orderId: row.order_id,
            customerName: row.customer_name,
            customerId: row.customer_id,
            orderDate: row.order_date,
            status: row.status,
            trackingCarrier: row.tracking_carrier,
            trackingCode: row.tracking_code,
            erpSyncStatus: row.erp_sync_status,
            totalAmount: row.total_amount,
            items: items,
            hasSyncIssue: row.erp_sync_status === 'ERROR' || row.status === 'ON_HOLD'
          },
          executedSql: `SELECT o.*, i.* FROM orders o JOIN order_items i ON o.order_id = i.order_id WHERE o.order_id = '${orderId}'`
        };
      } catch (err: any) {
        return {
          success: false,
          data: null,
          error: `Database query failed: ${err.message}`,
          executedSql: sql
        };
      }
    }
  };
}
