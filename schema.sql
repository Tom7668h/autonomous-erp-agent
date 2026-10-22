-- 1. Tabelle: Kundenaufträge (Orders)
CREATE TABLE IF NOT EXISTS orders (
    order_id VARCHAR(32) PRIMARY KEY,
    customer_id VARCHAR(32) NOT NULL,
    customer_name VARCHAR(100) NOT NULL,
    order_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(30) NOT NULL,            -- 'PENDING', 'PROCESSING', 'SHIPPED', 'ON_HOLD', 'CANCELLED'
    tracking_carrier VARCHAR(50),           -- 'DHL Freight', 'UPS Express', 'Schenker'
    tracking_code VARCHAR(100),
    erp_sync_status VARCHAR(20) NOT NULL,   -- 'SYNCED', 'DESYNCED', 'ERROR'
    total_amount DECIMAL(10, 2) NOT NULL
);

-- 2. Tabelle: Auftragspositionen (Order Items)
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id VARCHAR(32) NOT NULL,
    sku VARCHAR(64) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON order_items(sku);

-- 3. Tabelle: Lagerbestand & ERP-Bestandsführung (Inventory)
CREATE TABLE IF NOT EXISTS inventory (
    sku VARCHAR(64) PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    physical_stock INTEGER NOT NULL DEFAULT 0,    -- Tatsächlicher Lagerbestand vor Ort
    reserved_stock INTEGER NOT NULL DEFAULT 0,    -- Für offene Aufträge reserviert
    available_stock INTEGER GENERATED ALWAYS AS (physical_stock - reserved_stock) VIRTUAL,
    warehouse_bin VARCHAR(20) NOT NULL,          -- z.B. 'A-12-04'
    min_safety_stock INTEGER NOT NULL DEFAULT 5,
    supplier_eta DATE,                           -- Nächste geplante Anlieferung
    supplier_incoming_qty INTEGER DEFAULT 0      -- Unterwegs befindliche Stückzahl
);

-- 4. Tabelle: ERP & Wawi Synchronisations-Fehlerprotokoll (Sync Error Logs)
CREATE TABLE IF NOT EXISTS sync_error_logs (
    error_id VARCHAR(32) PRIMARY KEY,
    error_code VARCHAR(50) NOT NULL,             -- z.B. 'ERR_SQL_DEADLOCK_40001', 'ERR_PRICE_MISMATCH'
    affected_entity_type VARCHAR(30) NOT NULL,   -- 'ORDER', 'INVENTORY', 'PRICE'
    entity_id VARCHAR(64) NOT NULL,              -- z.B. Order-ID oder SKU
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved INTEGER NOT NULL DEFAULT 0          -- 0 = Offen, 1 = Behoben
);

CREATE INDEX IF NOT EXISTS idx_sync_err_code ON sync_error_logs(error_code);
CREATE INDEX IF NOT EXISTS idx_sync_entity ON sync_error_logs(entity_id);

-- 5. Tabelle: Support & 2nd-Level Eskalations-Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
    ticket_id VARCHAR(32) PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source VARCHAR(20) NOT NULL,                 -- 'WEB_CHAT', 'N8N_WEBHOOK', 'EMAIL'
    customer_query TEXT NOT NULL,
    assigned_level VARCHAR(20) NOT NULL,         -- '1ST_LEVEL_RESOLVED', '2ND_LEVEL_ESCALATED'
    agent_summary TEXT NOT NULL,
    recommended_sql_patch TEXT,                  -- Vom Agenten generierter SQL Fix
    patch_executed INTEGER NOT NULL DEFAULT 0,   -- 1 wenn von 2nd-Level bestätigt und ausgeführt
    resolution_status VARCHAR(20) NOT NULL       -- 'OPEN', 'IN_REVIEW', 'CLOSED'
);
