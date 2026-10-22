-- Vorherige Tabellendaten leeren
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM inventory;
DELETE FROM sync_error_logs;
DELETE FROM support_tickets;

-- 1. Inventory Seeding (Lagerbestand & Zulauf)
INSERT INTO inventory (sku, description, physical_stock, reserved_stock, warehouse_bin, min_safety_stock, supplier_eta, supplier_incoming_qty)
VALUES 
    ('SKU-7740', 'Knorr-Bremse Bremszylinder MB Actros MP4/MP5', 10, 14, 'H-03-12', 5, '2026-10-25', 20),
    ('SKU-1022', 'Bosch Common-Rail Injektor CR-04 (MAN TGS)', 25, 6, 'B-01-08', 10, '2026-11-02', 15),
    ('SKU-5501', 'Valeo Drehstrom-Lichtmaschine 28V 100A HD', 8, 2, 'C-05-14', 3, '2026-10-28', 5),
    ('SKU-3320', 'Wabco EBS Bremswertgeber Modulator 2-Kanal', 12, 4, 'E-02-09', 4, '2026-11-05', 10),
    ('SKU-9041', 'Mahle HD Ölfiltereinsatz OX 1076D Eco', 50, 10, 'A-08-01', 20, '2026-10-24', 40);

-- 2. Orders Seeding (Auftragsköpfe)
INSERT INTO orders (order_id, customer_id, customer_name, order_date, status, tracking_carrier, tracking_code, erp_sync_status, total_amount)
VALUES 
    ('ORD-9821', 'CUST-104', 'Spedition Müller GmbH & Co. KG', '2026-10-21 14:22:10', 'ON_HOLD', 'DHL Freight', NULL, 'ERROR', 1840.00),
    ('ORD-4412', 'CUST-208', 'Logistik Partner AG Hamburg', '2026-10-20 09:15:00', 'SHIPPED', 'DHL Freight', 'DHL-DE-9938210481', 'SYNCED', 1920.00),
    ('ORD-3390', 'CUST-305', 'Hermann Baustoffe Nutzfahrzeugflotte e.K.', '2026-10-22 08:30:00', 'PROCESSING', 'UPS Express', '1Z9999999999999999', 'SYNCED', 890.00);

-- 3. Order Items Seeding (Auftragspositionen)
INSERT INTO order_items (order_id, sku, quantity, unit_price)
VALUES 
    ('ORD-9821', 'SKU-7740', 4, 460.00),
    ('ORD-4412', 'SKU-1022', 6, 320.00),
    ('ORD-3390', 'SKU-3320', 2, 445.00);

-- 4. Sync Error Logs (Reale Fehlerprotokolle)
INSERT INTO sync_error_logs (error_id, error_code, affected_entity_type, entity_id, error_message, stack_trace, occurred_at, resolved)
VALUES 
    ('ERR-001', 'ERR_SQL_DEADLOCK_40001', 'ORDER', 'ORD-9821', 'Transaction (Process ID 82) was deadlocked on lock resources with another process and has been chosen as the deadlock victim. Rerun the transaction.', 'at Microsoft.Data.SqlClient.SqlConnection.OnError(SqlException exception)\nat ERP.SyncService.ProcessOrder(String orderId) in /src/Sync/OrderWorker.cs:line 142', '2026-10-21 14:23:05', 0),
    ('ERR-002', 'ERR_INVENTORY_NEGATIVE_RESERVATION', 'INVENTORY', 'SKU-7740', 'Integrity check failed: reserved_stock (14) exceeds physical_stock (10). Reservation mismatch in table inventory.', 'at ERP.InventoryService.ValidateReservations() in /src/Inventory/Validator.cs:line 88', '2026-10-21 15:02:18', 0),
    ('ERR-003', 'ERR_INVALID_EAN_CHECK_SUM', 'INVENTORY', 'SKU-5501', 'EAN 4012345678901 failed modulo 10 checksum verification during Shopware catalog export.', 'at CatalogExport.ShopwareConnector.ValidateEan(String ean) in /src/Export/EanRule.cs:line 33', '2026-10-22 06:12:40', 0);

-- 5. Support Tickets Seeding (Historie & Baseline)
INSERT INTO support_tickets (ticket_id, created_at, source, customer_query, assigned_level, agent_summary, recommended_sql_patch, patch_executed, resolution_status)
VALUES 
    ('TCK-1001', '2026-10-21 10:00:00', 'WEB_CHAT', 'Kunde fragt nach aktuellem Sendungsstatus für Auftrag ORD-4412.', '1ST_LEVEL_RESOLVED', 'Auftrag ORD-4412 ist ordnungsgemäß mit DHL Freight versendet worden. Tracking-Code DHL-DE-9938210481 mitgeteilt.', NULL, 0, 'CLOSED');
