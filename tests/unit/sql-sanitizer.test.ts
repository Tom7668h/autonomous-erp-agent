import { describe, it, expect } from 'vitest';
import { SqlSanitizer } from '../../src/utils/sql-sanitizer.js';

describe('SqlSanitizer', () => {
  it('should accept valid UPDATE statements with WHERE clause on allowed tables', () => {
    const validUpdate = "UPDATE inventory SET reserved_stock = 10 WHERE sku = 'SKU-7740'";
    const res = SqlSanitizer.validatePatch(validUpdate);
    expect(res.isValid).toBe(true);
    expect(res.sanitizedSql).toBe(validUpdate);
  });

  it('should accept valid INSERT statement on allowed tables', () => {
    const validInsert = "INSERT INTO sync_error_logs (error_id, error_code, affected_entity_type, entity_id, error_message) VALUES ('E99', 'RESOLVED', 'ORDER', 'ORD-1', 'Fixed')";
    const res = SqlSanitizer.validatePatch(validInsert);
    expect(res.isValid).toBe(true);
  });

  it('should reject UPDATE statement without WHERE clause (bulk protection)', () => {
    const dangerousUpdate = 'UPDATE inventory SET reserved_stock = 0';
    const res = SqlSanitizer.validatePatch(dangerousUpdate);
    expect(res.isValid).toBe(false);
    expect(res.reason).toContain('WHERE clause');
  });

  it('should reject destructive DROP / DELETE / TRUNCATE statements', () => {
    expect(SqlSanitizer.validatePatch('DROP TABLE inventory').isValid).toBe(false);
    expect(SqlSanitizer.validatePatch("DELETE FROM orders WHERE order_id = '1'").isValid).toBe(false);
    expect(SqlSanitizer.validatePatch('TRUNCATE TABLE sync_error_logs').isValid).toBe(false);
  });

  it('should reject statements on non-whitelisted tables', () => {
    const disallowed = "UPDATE users_passwords SET password = '123' WHERE id = 1";
    const res = SqlSanitizer.validatePatch(disallowed);
    expect(res.isValid).toBe(false);
    expect(res.reason).toContain('whitelist');
  });

  it('should reject multiple statements and SQL comments (injection prevention)', () => {
    const injection1 = "UPDATE inventory SET reserved_stock = 0 WHERE sku = 'SKU-1'; DROP TABLE orders";
    expect(SqlSanitizer.validatePatch(injection1).isValid).toBe(false);

    const injection2 = "UPDATE inventory SET reserved_stock = 0 WHERE sku = 'SKU-1' -- comment";
    expect(SqlSanitizer.validatePatch(injection2).isValid).toBe(false);
  });
});
