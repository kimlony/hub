CREATE TABLE IF NOT EXISTS hub_corp (
    id BIGSERIAL PRIMARY KEY,
    corp_cd VARCHAR(50) UNIQUE NOT NULL,
    corp_name VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    corp_id BIGINT REFERENCES hub_corp(id),
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(60) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hub_channels (
    mall_key VARCHAR(30) PRIMARY KEY,
    mall_name VARCHAR(100) NOT NULL,
    sort_order INT NOT NULL DEFAULT 100
);

INSERT INTO hub_channels (mall_key, mall_name, sort_order) VALUES
    ('MOCK_MALL', 'Mock Mall', 10),
    ('11ST', '11ST', 20),
    ('COUPANG', 'Coupang', 30),
    ('GODO', 'GODO', 40),
    ('GCHAN', 'Gift Channel', 50),
    ('WCHAN', 'W Channel', 60),
    ('ONRY', 'Onnuri Chance', 70),
    ('NSS', 'Naver Smartstore', 80)
ON CONFLICT (mall_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_malls (
    id BIGSERIAL PRIMARY KEY,
    corp_id BIGINT REFERENCES hub_corp(id),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mall_key VARCHAR(20) NOT NULL,
    account_name VARCHAR(100),
    key VARCHAR(500),
    key2 VARCHAR(500),
    auth_key VARCHAR(500),
    mall_id VARCHAR(255),
    mall_pw VARCHAR(500),
    use_yn CHAR(1) NOT NULL DEFAULT 'Y',
    vendor_id VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS idx_user_malls_corp ON user_malls(corp_id, mall_key, use_yn);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_user_malls_mock_corp
    ON user_malls(corp_id, mall_key)
    WHERE mall_key = 'MOCK_MALL';

CREATE TABLE IF NOT EXISTS hub_user_setting (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    auto_erp_apply BOOLEAN NOT NULL DEFAULT FALSE,
    auto_news_collect BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hub_job (
    request_id VARCHAR(100) PRIMARY KEY,
    request_key VARCHAR(200) UNIQUE NOT NULL,
    channel_cd VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    retry_count INT NOT NULL DEFAULT 0,
    error_message TEXT,
    completed_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    job_type VARCHAR(100) NOT NULL DEFAULT 'ORDER_COLLECT',
    source_erp VARCHAR(100) NOT NULL DEFAULT 'HUB',
    parent_job_id VARCHAR(100),
    correlation_id VARCHAR(100) NOT NULL,
    causation_id VARCHAR(100),
    schema_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    payload_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_job_status_updated ON hub_job(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_job_next_retry_at ON hub_job(status, next_retry_at) WHERE status = 'QUEUED';
CREATE INDEX IF NOT EXISTS idx_hub_job_parent_job_id ON hub_job(parent_job_id);
CREATE INDEX IF NOT EXISTS idx_hub_job_correlation_id ON hub_job(correlation_id);

CREATE TABLE IF NOT EXISTS hub_job_result (
    id BIGSERIAL PRIMARY KEY,
    request_id VARCHAR(100) NOT NULL,
    request_key VARCHAR(200),
    job_type VARCHAR(100) NOT NULL,
    source_erp VARCHAR(100) NOT NULL,
    result_payload JSONB NOT NULL,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_hub_job_result_request_id ON hub_job_result(request_id);
CREATE INDEX IF NOT EXISTS idx_hub_job_result_request_key ON hub_job_result(request_key);

CREATE TABLE IF NOT EXISTS hub_job_log (
    id BIGSERIAL PRIMARY KEY,
    request_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    job_type VARCHAR(100),
    source_erp VARCHAR(100),
    request_key VARCHAR(200),
    channel_cd VARCHAR(30),
    mall_key VARCHAR(50),
    retry_count INT,
    max_retry_count INT,
    error_message TEXT,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_job_log_request_created ON hub_job_log(request_id, created_at ASC, id ASC);

CREATE TABLE IF NOT EXISTS hub_job_lock (
    lock_key VARCHAR(200) PRIMARY KEY,
    request_id VARCHAR(100) NOT NULL,
    locked_by VARCHAR(120) NOT NULL,
    locked_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hub_job_lock_expires_at ON hub_job_lock(expires_at);

CREATE TABLE IF NOT EXISTS hub_job_outbox (
    id BIGSERIAL PRIMARY KEY,
    request_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    topic VARCHAR(120) NOT NULL,
    partition_key VARCHAR(200) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    max_retry_count INT NOT NULL DEFAULT 5,
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_by VARCHAR(120),
    locked_at TIMESTAMPTZ,
    last_error TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_job_outbox_status_retry ON hub_job_outbox(status, next_retry_at);

CREATE TABLE IF NOT EXISTS hub_collected_order (
    id BIGSERIAL PRIMARY KEY,
    corp_id BIGINT NOT NULL REFERENCES hub_corp(id),
    channel_account_id BIGINT NOT NULL REFERENCES user_malls(id),
    user_id BIGINT NOT NULL REFERENCES users(id),
    request_id VARCHAR(100),
    request_key VARCHAR(200),
    source_erp VARCHAR(50) NOT NULL DEFAULT 'HUB',
    channel_cd VARCHAR(30) NOT NULL,
    mall_key VARCHAR(50),
    channel_order_id VARCHAR(120) NOT NULL,
    order_status VARCHAR(80),
    claim_status VARCHAR(80),
    claim_type VARCHAR(80),
    order_date TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    buyer_name VARCHAR(200),
    buyer_tel VARCHAR(100),
    buyer_email VARCHAR(300),
    payment_method VARCHAR(80),
    currency_code VARCHAR(10) NOT NULL DEFAULT 'KRW',
    order_amount NUMERIC(18, 2),
    product_amount NUMERIC(18, 2),
    delivery_fee NUMERIC(18, 2),
    discount_amount NUMERIC(18, 2),
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_hub_collected_order_account_order
    ON hub_collected_order(channel_account_id, channel_order_id);
CREATE INDEX IF NOT EXISTS idx_hub_collected_order_corp_date
    ON hub_collected_order(corp_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_hub_collected_order_user_date
    ON hub_collected_order(user_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_hub_collected_order_channel_date
    ON hub_collected_order(channel_cd, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_hub_collected_order_request
    ON hub_collected_order(request_id);

CREATE TABLE IF NOT EXISTS hub_collected_order_item (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES hub_collected_order(id) ON DELETE CASCADE,
    channel_order_item_id VARCHAR(160) NOT NULL,
    product_id VARCHAR(120),
    seller_product_code VARCHAR(160),
    sku_code VARCHAR(160),
    product_name VARCHAR(500),
    option_name VARCHAR(500),
    item_status VARCHAR(80),
    quantity INTEGER,
    unit_price NUMERIC(18, 2),
    item_amount NUMERIC(18, 2),
    discount_amount NUMERIC(18, 2),
    expected_settlement_amount NUMERIC(18, 2),
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_hub_collected_order_item_channel_item
    ON hub_collected_order_item(order_id, channel_order_item_id);

CREATE TABLE IF NOT EXISTS hub_collected_order_delivery (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL UNIQUE REFERENCES hub_collected_order(id) ON DELETE CASCADE,
    receiver_name VARCHAR(200),
    receiver_tel VARCHAR(100),
    receiver_zip_code VARCHAR(30),
    receiver_addr1 VARCHAR(500),
    receiver_addr2 VARCHAR(500),
    delivery_memo VARCHAR(1000),
    delivery_company VARCHAR(100),
    tracking_number VARCHAR(100),
    delivery_status VARCHAR(80),
    shipping_due_at TIMESTAMPTZ,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hub_order_normalize_checkpoint (
    request_id VARCHAR(100) PRIMARY KEY,
    status VARCHAR(20) NOT NULL,
    normalized_count INT NOT NULL DEFAULT 0,
    error_message TEXT,
    normalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_order_normalize_checkpoint_status
    ON hub_order_normalize_checkpoint(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS hub_order_status_history (
    id BIGSERIAL PRIMARY KEY,
    request_id VARCHAR(100) NOT NULL,
    order_id BIGINT NOT NULL REFERENCES hub_collected_order(id) ON DELETE CASCADE,
    before_order_status VARCHAR(80),
    after_order_status VARCHAR(80),
    before_claim_status VARCHAR(80),
    after_claim_status VARCHAR(80),
    before_delivery_status VARCHAR(80),
    after_delivery_status VARCHAR(80),
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_order_status_history_order_synced
    ON hub_order_status_history(order_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_order_status_history_request
    ON hub_order_status_history(request_id);

CREATE TABLE IF NOT EXISTS hub_erp_connection (
    id BIGSERIAL PRIMARY KEY,
    corp_id BIGINT NOT NULL REFERENCES hub_corp(id),
    erp_connection_id VARCHAR(100) NOT NULL,
    erp_type VARCHAR(50) NOT NULL DEFAULT 'MOCK',
    base_url VARCHAR(500),
    auth_type VARCHAR(20) NOT NULL DEFAULT 'NONE',
    token_url VARCHAR(500),
    client_id VARCHAR(200),
    client_secret TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (corp_id, erp_connection_id),
    UNIQUE (erp_connection_id)
);

CREATE TABLE IF NOT EXISTS hub_erp_apply_result (
    id BIGSERIAL PRIMARY KEY,
    request_id VARCHAR(100) NOT NULL,
    correlation_id VARCHAR(100) NOT NULL,
    normalized_order_id BIGINT NOT NULL REFERENCES hub_collected_order(id),
    erp_connection_id VARCHAR(100) NOT NULL,
    operation VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL,
    idempotency_key VARCHAR(200) NOT NULL,
    erp_document_no VARCHAR(120),
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_code VARCHAR(100),
    error_message TEXT,
    attempt_count INT NOT NULL DEFAULT 0,
    delivery_type VARCHAR(30) NOT NULL DEFAULT 'ERP_PUSH',
    trigger_type VARCHAR(30) NOT NULL DEFAULT 'AUTO',
    external_client_id BIGINT,
    delivered_by_user_id BIGINT,
    delivery_note TEXT,
    applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (idempotency_key, normalized_order_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_erp_apply_result_request
    ON hub_erp_apply_result(request_id);
CREATE INDEX IF NOT EXISTS idx_hub_erp_apply_result_status
    ON hub_erp_apply_result(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_erp_apply_result_correlation
    ON hub_erp_apply_result(correlation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS hub_erp_apply_command (
    id BIGSERIAL PRIMARY KEY,
    command_id VARCHAR(100) NOT NULL UNIQUE,
    corp_id BIGINT NOT NULL REFERENCES hub_corp(id),
    user_id BIGINT NOT NULL REFERENCES users(id),
    client_request_id VARCHAR(100) NOT NULL,
    erp_connection_id VARCHAR(100) NOT NULL,
    operation VARCHAR(30) NOT NULL,
    reason VARCHAR(500),
    status VARCHAR(30) NOT NULL,
    requested_count INT NOT NULL,
    accepted_count INT NOT NULL DEFAULT 0,
    skipped_count INT NOT NULL DEFAULT 0,
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    skipped_order_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (corp_id, client_request_id)
);

CREATE TABLE IF NOT EXISTS hub_erp_apply_command_job (
    id BIGSERIAL PRIMARY KEY,
    command_id VARCHAR(100) NOT NULL REFERENCES hub_erp_apply_command(command_id) ON DELETE CASCADE,
    job_request_id VARCHAR(100) NOT NULL REFERENCES hub_job(request_id),
    source_normalize_job_id VARCHAR(100) NOT NULL,
    order_count INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (command_id, job_request_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_erp_apply_command_corp_created
    ON hub_erp_apply_command(corp_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hub_collect_schedule (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    schedule_name VARCHAR(100) NOT NULL,
    mall_keys JSONB NOT NULL,
    schedule_mode VARCHAR(20) NOT NULL DEFAULT 'FIXED_TIME',
    interval_hours INT,
    date_range_type VARCHAR(30) NOT NULL,
    run_time TIME NOT NULL,
    enabled_yn CHAR(1) NOT NULL DEFAULT 'Y',
    running_yn CHAR(1) NOT NULL DEFAULT 'N',
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ NOT NULL,
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_collect_schedule_user
    ON hub_collect_schedule(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_collect_schedule_due
    ON hub_collect_schedule(enabled_yn, running_yn, next_run_at);

CREATE TABLE IF NOT EXISTS hub_collect_schedule_run_log (
    id BIGSERIAL PRIMARY KEY,
    schedule_id BIGINT REFERENCES hub_collect_schedule(id) ON DELETE SET NULL,
    user_id BIGINT NOT NULL REFERENCES users(id),
    schedule_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    mall_keys JSONB NOT NULL,
    date_range_type VARCHAR(30) NOT NULL,
    fr_dt VARCHAR(8) NOT NULL,
    to_dt VARCHAR(8) NOT NULL,
    job_count INT NOT NULL DEFAULT 0,
    request_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_collect_schedule_run_log_user
    ON hub_collect_schedule_run_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_collect_schedule_run_log_schedule
    ON hub_collect_schedule_run_log(schedule_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hub_order_status_sync_schedule (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    schedule_name VARCHAR(100) NOT NULL,
    mall_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
    channel_account_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    status_types JSONB NOT NULL,
    schedule_mode VARCHAR(20) NOT NULL DEFAULT 'FIXED_TIME',
    interval_hours INT,
    date_range_type VARCHAR(30) NOT NULL,
    run_time TIME NOT NULL,
    enabled_yn CHAR(1) NOT NULL DEFAULT 'Y',
    running_yn CHAR(1) NOT NULL DEFAULT 'N',
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ NOT NULL,
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_order_status_sync_schedule_user
    ON hub_order_status_sync_schedule(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_order_status_sync_schedule_due
    ON hub_order_status_sync_schedule(enabled_yn, running_yn, next_run_at);

CREATE TABLE IF NOT EXISTS hub_order_status_sync_schedule_run_log (
    id BIGSERIAL PRIMARY KEY,
    schedule_id BIGINT REFERENCES hub_order_status_sync_schedule(id) ON DELETE SET NULL,
    user_id BIGINT NOT NULL REFERENCES users(id),
    schedule_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    mall_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
    channel_account_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    status_types JSONB NOT NULL,
    date_range_type VARCHAR(30) NOT NULL,
    fr_dt VARCHAR(8) NOT NULL,
    to_dt VARCHAR(8) NOT NULL,
    job_count INT NOT NULL DEFAULT 0,
    request_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_order_status_sync_schedule_run_log_user
    ON hub_order_status_sync_schedule_run_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_order_status_sync_schedule_run_log_schedule
    ON hub_order_status_sync_schedule_run_log(schedule_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hub_worker_heartbeat (
    worker_id VARCHAR(100) PRIMARY KEY,
    role VARCHAR(30) NOT NULL,
    pid INT NOT NULL,
    hostname VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    heartbeat_interval_seconds INT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_hub_worker_heartbeat_role
    ON hub_worker_heartbeat(role, last_seen_at);

CREATE TABLE IF NOT EXISTS hub_external_api_client (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    client_name VARCHAR(100) NOT NULL,
    client_id VARCHAR(80) NOT NULL UNIQUE,
    client_secret_enc TEXT NOT NULL,
    client_secret_fingerprint VARCHAR(64) NOT NULL,
    scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    token_ttl_seconds INT NOT NULL DEFAULT 1800,
    signature_valid_seconds INT NOT NULL DEFAULT 300,
    allowed_ips JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_called_at TIMESTAMPTZ,
    secret_rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disabled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_external_api_client_user
    ON hub_external_api_client(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_external_api_client_status
    ON hub_external_api_client(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_external_api_client_last_called
    ON hub_external_api_client(last_called_at DESC);

CREATE TABLE IF NOT EXISTS hub_channel_notice (
    id BIGSERIAL PRIMARY KEY,
    channel_cd VARCHAR(30) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    reason TEXT,
    failure_count INT NOT NULL DEFAULT 0,
    first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_hub_channel_notice_open
    ON hub_channel_notice(channel_cd)
    WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_hub_channel_notice_status
    ON hub_channel_notice(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS hub_order_export_file (
    id BIGSERIAL PRIMARY KEY,
    export_id VARCHAR(100) NOT NULL UNIQUE,
    corp_id BIGINT NOT NULL,
    user_id BIGINT,
    export_type VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL,
    file_name VARCHAR(255),
    file_path TEXT,
    total_count INT NOT NULL DEFAULT 0,
    filter_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_hub_order_export_file_corp_created
    ON hub_order_export_file(corp_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hub_news (
    id BIGSERIAL PRIMARY KEY,
    source VARCHAR(80) NOT NULL,
    category VARCHAR(80),
    title VARCHAR(500) NOT NULL,
    summary TEXT,
    url TEXT,
    corp_name VARCHAR(200),
    content_hash VARCHAR(128) NOT NULL UNIQUE,
    published_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_news_source_published
    ON hub_news(source, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_news_published
    ON hub_news(published_at DESC);

CREATE TABLE IF NOT EXISTS hub_load_test_run (
    id BIGSERIAL PRIMARY KEY,
    run_id VARCHAR(80) NOT NULL UNIQUE,
    mode VARCHAR(30) NOT NULL,
    scenario VARCHAR(120),
    status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
    total_requested INTEGER NOT NULL,
    page_size INTEGER,
    total_jobs INTEGER NOT NULL,
    total_collect_jobs INTEGER NOT NULL DEFAULT 0,
    total_normalize_jobs INTEGER NOT NULL DEFAULT 0,
    completed_jobs INTEGER NOT NULL,
    completed_normalize_jobs INTEGER NOT NULL DEFAULT 0,
    success_jobs INTEGER NOT NULL,
    failed_jobs INTEGER NOT NULL,
    normalized_orders INTEGER NOT NULL DEFAULT 0,
    elapsed_ms BIGINT NOT NULL,
    orders_per_second DOUBLE PRECISION NOT NULL DEFAULT 0,
    jobs_per_second DOUBLE PRECISION NOT NULL DEFAULT 0,
    throughput_per_minute DOUBLE PRECISION NOT NULL,
    avg_duration_ms DOUBLE PRECISION NOT NULL,
    p50_duration_ms DOUBLE PRECISION NOT NULL,
    p95_duration_ms DOUBLE PRECISION NOT NULL,
    max_duration_ms DOUBLE PRECISION NOT NULL,
    outbox_total INTEGER NOT NULL DEFAULT 0,
    outbox_pending INTEGER NOT NULL DEFAULT 0,
    outbox_publishing INTEGER NOT NULL DEFAULT 0,
    outbox_sent INTEGER NOT NULL DEFAULT 0,
    outbox_failed INTEGER NOT NULL DEFAULT 0,
    params JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_path VARCHAR(500),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_load_test_run_created_at
    ON hub_load_test_run(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_load_test_run_status
    ON hub_load_test_run(status, created_at DESC);
