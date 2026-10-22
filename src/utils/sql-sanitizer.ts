export interface SqlValidationResult {
  isValid: boolean;
  sanitizedSql?: string;
  reason?: string;
}

const ALLOWED_TABLES = ['inventory', 'orders', 'sync_error_logs', 'support_tickets', 'order_items'];
const FORBIDDEN_KEYWORDS = [
  'DROP',
  'DELETE',
  'TRUNCATE',
  'ALTER',
  'CREATE',
  'REPLACE',
  'EXEC',
  'ATTACH',
  'DETACH',
  'PRAGMA',
  'UNION',
  'GRANT',
  'REVOKE'
];

export class SqlSanitizer {
  /**
   * Validates and sanitizes an AI-suggested SQL patch.
   * Only allows single UPDATE or INSERT statements on authorized tables with mandatory WHERE clause for UPDATE.
   */
  static validatePatch(sql: string): SqlValidationResult {
    if (!sql || typeof sql !== 'string') {
      return { isValid: false, reason: 'Empty SQL statement provided.' };
    }

    const trimmed = sql.trim().replace(/;$/, '').trim();

    if (!trimmed) {
      return { isValid: false, reason: 'Empty SQL statement provided.' };
    }

    // Check for multiple statements (semicolon inside)
    if (trimmed.includes(';')) {
      return { isValid: false, reason: 'Multiple SQL statements or chained semicolons are prohibited.' };
    }

    // Check for comment injections
    if (trimmed.includes('--') || trimmed.includes('/*') || trimmed.includes('*/')) {
      return { isValid: false, reason: 'SQL comments are not allowed in automated patches.' };
    }

    const upper = trimmed.toUpperCase();

    // Check for forbidden DDL / destructive keywords
    for (const keyword of FORBIDDEN_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(upper)) {
        return { isValid: false, reason: `Forbidden SQL operation detected: '${keyword}'.` };
      }
    }

    const isUpdate = upper.startsWith('UPDATE');
    const isInsert = upper.startsWith('INSERT INTO') || upper.startsWith('INSERT');

    if (!isUpdate && !isInsert) {
      return {
        isValid: false,
        reason: 'Only UPDATE and INSERT statements are permitted for 2nd-level ERP patches.'
      };
    }

    // Check allowed target table
    const tableFound = ALLOWED_TABLES.some(table => {
      const regex = new RegExp(`\\b(UPDATE|INTO)\\s+${table}\\b`, 'i');
      return regex.test(trimmed);
    });

    if (!tableFound) {
      return {
        isValid: false,
        reason: `Target table not in permitted whitelist: [${ALLOWED_TABLES.join(', ')}].`
      };
    }

    // Require WHERE clause for UPDATE to prevent updating all rows
    if (isUpdate) {
      const whereMatch = /\bWHERE\b/i.test(trimmed);
      if (!whereMatch) {
        return {
          isValid: false,
          reason: 'UPDATE statements must include an explicit WHERE clause to prevent accidental bulk modifications.'
        };
      }
    }

    return {
      isValid: true,
      sanitizedSql: trimmed
    };
  }
}
