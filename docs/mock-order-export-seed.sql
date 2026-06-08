-- Mock order collection results for /api/hub/orders/export
-- Run this in the PostgreSQL console.

INSERT INTO hub_job (
    request_id,
    request_key,
    channel_cd,
    status,
    payload,
    retry_count,
    job_type,
    source_erp,
    completed_at,
    created_at,
    updated_at
) VALUES
(
    '11111111-1111-4111-8111-111111111111',
    'MOCK_11ST_20260608_20260608_admin',
    '11ST',
    'SUCCESS',
    '{"userId":1,"mallKey":"11ST","channelCd":"11ST","frDt":"20260608","toDt":"20260608","triggerType":"MANUAL"}'::json,
    0,
    'ORDER_COLLECT',
    'HUB',
    NOW(),
    NOW(),
    NOW()
),
(
    '22222222-2222-4222-8222-222222222222',
    'MOCK_GODO_20260608_20260608_admin',
    'GODO',
    'SUCCESS',
    '{"userId":1,"mallKey":"GODO","channelCd":"GODO","frDt":"20260608","toDt":"20260608","triggerType":"MANUAL"}'::json,
    0,
    'ORDER_COLLECT',
    'HUB',
    NOW(),
    NOW(),
    NOW()
)
ON CONFLICT (request_id) DO NOTHING;

INSERT INTO hub_job_result (
    request_id,
    request_key,
    job_type,
    source_erp,
    result_payload,
    saved_at
) VALUES
(
    '11111111-1111-4111-8111-111111111111',
    'MOCK_11ST_20260608_20260608_admin',
    'ORDER_COLLECT',
    'HUB',
    '{
      "channelCd": "11ST",
      "frDt": "20260608",
      "toDt": "20260608",
      "totalCount": 3,
      "orders": [
        {
          "orderNo": "11ST-20260608-0001",
          "orderStatus": "PAYMENT_COMPLETE",
          "orderDate": "2026-06-08 09:15:23",
          "receiverName": "Kim Test",
          "productName": "Eazy Test Product A",
          "quantity": 2,
          "orderAmount": 39800,
          "buyerName": "Buyer A",
          "buyerTel": "010-0000-0001"
        },
        {
          "orderNo": "11ST-20260608-0002",
          "orderStatus": "READY_TO_SHIP",
          "orderDate": "2026-06-08 10:22:11",
          "receiverName": "Lee Test",
          "productName": "Eazy Test Product B",
          "quantity": 1,
          "orderAmount": 15900,
          "buyerName": "Buyer B",
          "buyerTel": "010-0000-0002"
        },
        {
          "orderNo": "11ST-20260608-0003",
          "orderStatus": "PAYMENT_COMPLETE",
          "orderDate": "2026-06-08 11:03:42",
          "receiverName": "Park Test",
          "productName": "Eazy Test Product C",
          "quantity": 3,
          "orderAmount": 74700,
          "buyerName": "Buyer C",
          "buyerTel": "010-0000-0003"
        }
      ]
    }'::jsonb,
    NOW()
),
(
    '22222222-2222-4222-8222-222222222222',
    'MOCK_GODO_20260608_20260608_admin',
    'ORDER_COLLECT',
    'HUB',
    '{
      "channelCd": "GODO",
      "frDt": "20260608",
      "toDt": "20260608",
      "totalCount": 2,
      "code": "000",
      "message": "success",
      "orders": [
        {
          "ordNo": "GODO-20260608-0001",
          "ordStatus": "paid",
          "ordDt": "2026-06-08 12:11:09",
          "recvName": "Choi Test",
          "goodsNm": "GODO Mock Goods A",
          "qty": "1",
          "payAmount": "28,500",
          "receiverTel": "010-0000-1001"
        },
        {
          "ordNo": "GODO-20260608-0002",
          "ordStatus": "shipping_ready",
          "ordDt": "2026-06-08 13:35:51",
          "recvName": "Jung Test",
          "goodsNm": "GODO Mock Goods B",
          "qty": "4",
          "payAmount": "112000",
          "receiverTel": "010-0000-1002"
        }
      ]
    }'::jsonb,
    NOW()
)
ON CONFLICT (request_id) DO UPDATE
SET result_payload = EXCLUDED.result_payload,
    saved_at = NOW();
