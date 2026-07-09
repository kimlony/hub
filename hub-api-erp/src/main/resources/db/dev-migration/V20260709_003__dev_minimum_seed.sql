-- Development-only minimum seed data.
-- Login account: demo / password

WITH demo_corp AS (
    INSERT INTO hub_corp (corp_cd, corp_name)
    VALUES ('DEMO', 'Demo Corporation')
    ON CONFLICT (corp_cd) DO UPDATE
        SET corp_name = EXCLUDED.corp_name,
            updated_at = NOW()
    RETURNING id
), demo_user AS (
    INSERT INTO users (corp_id, username, password)
    SELECT id,
           'demo',
           '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
    FROM demo_corp
    ON CONFLICT (username) DO UPDATE
        SET corp_id = EXCLUDED.corp_id,
            password = EXCLUDED.password
    RETURNING id, corp_id
), demo_setting AS (
    INSERT INTO hub_user_setting (user_id, auto_erp_apply, auto_news_collect)
    SELECT id, false, false
    FROM demo_user
    ON CONFLICT (user_id) DO UPDATE
        SET auto_erp_apply = EXCLUDED.auto_erp_apply,
            auto_news_collect = EXCLUDED.auto_news_collect,
            updated_at = NOW()
    RETURNING user_id
), demo_mock_account AS (
    INSERT INTO user_malls (corp_id, user_id, mall_key, account_name, mall_id, use_yn)
    SELECT corp_id, id, 'MOCK_MALL', 'Demo Mock Mall', 'demo-mock-mall', 'Y'
    FROM demo_user
    ON CONFLICT (corp_id, mall_key) WHERE mall_key = 'MOCK_MALL' DO UPDATE
        SET user_id = EXCLUDED.user_id,
            account_name = EXCLUDED.account_name,
            mall_id = EXCLUDED.mall_id,
            use_yn = EXCLUDED.use_yn
    RETURNING id
)
INSERT INTO hub_erp_connection (corp_id, erp_connection_id, erp_type, auth_type, is_active)
SELECT id, 'MOCK-DEMO', 'MOCK', 'NONE', true
FROM demo_corp
ON CONFLICT (corp_id, erp_connection_id) DO UPDATE
    SET erp_type = EXCLUDED.erp_type,
        auth_type = EXCLUDED.auth_type,
        is_active = EXCLUDED.is_active,
        updated_at = NOW();