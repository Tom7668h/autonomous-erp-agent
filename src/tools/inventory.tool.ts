import { Database as DatabaseType } from 'better-sqlite3';
import { ToolDefinition, ToolExecutionResult } from '../agent/agent.types.js';

export function createInventoryTool(db: DatabaseType): ToolDefinition {
  return {
    name: 'check_inventory_and_supplier_feed',
    description: 'Checks physical on-hand stock, reserved order stock, available quantity, warehouse storage bin, safety stock thresholds, and incoming supplier replenishments with ETA for a given SKU (e.g., SKU-7740).',
    parameters: {
      type: 'object',
      properties: {
        sku: {
          type: 'string',
          description: 'The product Stock Keeping Unit (e.g., SKU-7740, SKU-1022)'
        }
      },
      required: ['sku']
    },
    execute: async (args: Record<string, any>): Promise<ToolExecutionResult> => {
      const sku = args.sku?.trim();
      if (!sku) {
        return {
          success: false,
          data: null,
          error: 'Missing required parameter: sku'
        };
      }

      const sql = `
        SELECT 
          sku,
          description,
          physical_stock,
          reserved_stock,
          (physical_stock - reserved_stock) AS available_stock,
          warehouse_bin,
          min_safety_stock,
          supplier_eta,
          supplier_incoming_qty
        FROM inventory
        WHERE sku = ?
      `;

      try {
        const item = db.prepare(sql).get(sku) as any;

        if (!item) {
          return {
            success: false,
            data: null,
            error: `SKU '${sku}' not found in ERP inventory registry.`,
            executedSql: `SELECT * FROM inventory WHERE sku = '${sku}'`
          };
        }

        const isOverbooked = item.physical_stock < item.reserved_stock;
        const shortage = isOverbooked ? item.reserved_stock - item.physical_stock : 0;
        const isBelowSafetyStock = item.available_stock < item.min_safety_stock;

        return {
          success: true,
          data: {
            sku: item.sku,
            description: item.description,
            physicalStock: item.physical_stock,
            reservedStock: item.reserved_stock,
            availableStock: item.available_stock,
            warehouseBin: item.warehouse_bin,
            minSafetyStock: item.min_safety_stock,
            supplierEta: item.supplier_eta,
            supplierIncomingQty: item.supplier_incoming_qty,
            statusSummary: {
              isOverbooked,
              shortageAmount: shortage,
              isBelowSafetyStock,
              criticalIssue: isOverbooked
                ? `CRITICAL OVERBOOKING: Reserved (${item.reserved_stock}) exceeds physical (${item.physical_stock}) by ${shortage} units!`
                : null
            }
          },
          executedSql: `SELECT sku, physical_stock, reserved_stock, warehouse_bin, supplier_eta, supplier_incoming_qty FROM inventory WHERE sku = '${sku}'`
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
