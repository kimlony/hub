package hub.order.schema;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@DependsOn("tenantSchemaInitializer")
@RequiredArgsConstructor
public class OrderNormalizeSchemaInitializer {

    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void initialize() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS hub_collected_order (
                    id BIGSERIAL PRIMARY KEY,
                    corp_id BIGINT NOT NULL REFERENCES hub_corp(id),
                    channel_account_id BIGINT NOT NULL REFERENCES user_malls(id),
                    user_id BIGINT NOT NULL REFERENCES users(id),
                    request_id VARCHAR(36),
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
                )
                """);
        jdbcTemplate.execute("ALTER TABLE hub_collected_order ADD COLUMN IF NOT EXISTS user_id BIGINT");
        jdbcTemplate.execute("ALTER TABLE hub_collected_order ADD COLUMN IF NOT EXISTS corp_id BIGINT");
        jdbcTemplate.execute("ALTER TABLE hub_collected_order ADD COLUMN IF NOT EXISTS channel_account_id BIGINT");
        jdbcTemplate.execute("""
                INSERT INTO user_malls (corp_id, user_id, mall_key, account_name, use_yn)
                SELECT DISTINCT u.corp_id, o.user_id, o.mall_key, o.mall_key || '-legacy', 'Y'
                FROM hub_collected_order o
                JOIN users u ON u.id = o.user_id
                WHERE o.channel_account_id IS NULL
                  AND o.mall_key IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1
                      FROM user_malls m
                      WHERE m.user_id = o.user_id
                        AND m.mall_key = o.mall_key
                  )
                """);
        jdbcTemplate.execute("""
                UPDATE hub_collected_order o
                SET corp_id = u.corp_id,
                    channel_account_id = (
                        SELECT m.id
                        FROM user_malls m
                        WHERE m.user_id = o.user_id
                          AND m.mall_key = o.mall_key
                        ORDER BY m.id
                        LIMIT 1
                    )
                FROM users u
                WHERE o.user_id = u.id
                  AND (o.corp_id IS NULL OR o.channel_account_id IS NULL)
                """);
        jdbcTemplate.execute("ALTER TABLE hub_collected_order ALTER COLUMN corp_id SET NOT NULL");
        jdbcTemplate.execute("ALTER TABLE hub_collected_order ALTER COLUMN channel_account_id SET NOT NULL");
        jdbcTemplate.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname IN ('fk_hub_collected_order_corp', 'hub_collected_order_corp_id_fkey')
                          AND conrelid = 'hub_collected_order'::regclass
                    ) THEN
                        ALTER TABLE hub_collected_order
                        ADD CONSTRAINT fk_hub_collected_order_corp
                        FOREIGN KEY (corp_id) REFERENCES hub_corp(id);
                    END IF;
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname IN (
                            'fk_hub_collected_order_channel_account',
                            'hub_collected_order_channel_account_id_fkey'
                        )
                          AND conrelid = 'hub_collected_order'::regclass
                    ) THEN
                        ALTER TABLE hub_collected_order
                        ADD CONSTRAINT fk_hub_collected_order_channel_account
                        FOREIGN KEY (channel_account_id) REFERENCES user_malls(id);
                    END IF;
                END $$
                """);
        jdbcTemplate.execute("DROP INDEX IF EXISTS uidx_hub_collected_order_channel_order");
        jdbcTemplate.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uidx_hub_collected_order_account_order
                ON hub_collected_order(channel_account_id, channel_order_id)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_collected_order_corp_date
                ON hub_collected_order(corp_id, order_date DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_collected_order_user_date
                ON hub_collected_order(user_id, order_date DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_collected_order_channel_date
                ON hub_collected_order(channel_cd, order_date DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_collected_order_request
                ON hub_collected_order(request_id)
                """);

        jdbcTemplate.execute("""
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
                )
                """);
        jdbcTemplate.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uidx_hub_collected_order_item_channel_item
                ON hub_collected_order_item(order_id, channel_order_item_id)
                """);

        jdbcTemplate.execute("""
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
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS hub_order_normalize_checkpoint (
                    request_id VARCHAR(36) PRIMARY KEY,
                    status VARCHAR(20) NOT NULL,
                    normalized_count INT NOT NULL DEFAULT 0,
                    error_message TEXT,
                    normalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_order_normalize_checkpoint_status
                ON hub_order_normalize_checkpoint(status, updated_at DESC)
                """);
    }
}
