package hub.order.schema;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@DependsOn("orderNormalizeSchemaInitializer")
@RequiredArgsConstructor
public class OrderStatusHistorySchemaInitializer {

    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void initialize() {
        jdbcTemplate.execute("""
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
                )
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_order_status_history_order_synced
                ON hub_order_status_history(order_id, synced_at DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_order_status_history_request
                ON hub_order_status_history(request_id)
                """);
    }
}
