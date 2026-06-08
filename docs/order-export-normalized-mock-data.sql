-- Mock normalized order data for BizBee HUB order export.
-- Prerequisite: run docs/order-export-normalized-schema.sql first.

WITH upsert_order AS (
    INSERT INTO hub_collected_order (
        user_id, request_id, request_key, channel_cd, mall_key,
        channel_order_id, order_status, claim_status, claim_type,
        order_date, paid_at, buyer_name, buyer_tel, buyer_email,
        payment_method, order_amount, product_amount, delivery_fee, discount_amount,
        raw_payload
    ) VALUES
    (
        1,
        'naver-mock-0001',
        'MOCK_NAVER_20260608_20260608_admin',
        'NAVER',
        'NAVER',
        'NAVER-ORDER-20260608-0001',
        'PAYED',
        NULL,
        NULL,
        '2026-06-08 09:10:00+09',
        '2026-06-08 09:12:00+09',
        'Naver Buyer',
        '010-1000-0001',
        NULL,
        'NAVER_PAY',
        45000,
        42000,
        3000,
        1000,
        '{
          "productOrderId": "NAVER-PRODUCT-ORDER-0001",
          "order": {
            "orderId": "NAVER-ORDER-20260608-0001",
            "ordererName": "Naver Buyer",
            "ordererTel": "010-1000-0001",
            "orderDate": "2026-06-08T09:10:00+09:00",
            "paymentDate": "2026-06-08T09:12:00+09:00",
            "paymentMeans": "NAVER_PAY"
          },
          "productOrder": {
            "productOrderId": "NAVER-PRODUCT-ORDER-0001",
            "productOrderStatus": "PAYED",
            "productName": "Naver SmartStore Mock Product",
            "productOption": "Color: Black / Size: M",
            "quantity": 2,
            "unitPrice": 21000,
            "totalPaymentAmount": 45000,
            "shippingAddress": {
              "name": "Naver Receiver",
              "tel1": "010-2000-0001",
              "zipCode": "06100",
              "baseAddress": "Seoul Gangnam-gu",
              "detailedAddress": "101-1001"
            }
          }
        }'::jsonb
    ),
    (
        1,
        'st11-mock-0001',
        'MOCK_11ST_20260608_20260608_admin',
        '11ST',
        '11ST',
        '201001108318120',
        'PAYMENT_COMPLETE',
        NULL,
        NULL,
        '2026-06-08 10:07:11+09',
        '2026-06-08 10:20:59+09',
        '11ST Buyer',
        '010-1000-0011',
        NULL,
        'CARD',
        16310,
        19000,
        0,
        2690,
        '{
          "ordNo": "201001108318120",
          "ordDt": "2026-06-08 10:07:11",
          "ordNm": "11ST Buyer",
          "ordPrtblTel": "010-1000-0011",
          "ordPayAmt": 16310,
          "ordAmt": 19000,
          "ordQty": 1,
          "prdNm": "11ST Mock Product",
          "prdNo": "29370295",
          "sellerPrdCd": "000000000133275",
          "slctPrdOptNm": "Size: S / Color: Ivory",
          "rcvrNm": "11ST Receiver",
          "rcvrPrtblNo": "010-2000-0011",
          "rcvrMailNo": "360100",
          "rcvrBaseAddr": "Chungbuk Cheongju",
          "rcvrDtlsAddr": "8809"
        }'::jsonb
    ),
    (
        1,
        'coupang-mock-0001',
        'MOCK_COUPANG_20260608_20260608_admin',
        'COUPANG',
        'COUPANG',
        '22000009546234',
        'FINAL_DELIVERY',
        NULL,
        NULL,
        '2026-06-08 11:17:13+09',
        '2026-06-08 11:18:13+09',
        'Coupang Buyer',
        '010-1000-0022',
        'buyer@example.com',
        'COUPANG_PAY',
        21000,
        19000,
        5000,
        3000,
        '{
          "shipmentBoxId": "642538970006401429",
          "orderId": "22000009546234",
          "orderedAt": "2026-06-08T11:17:13+09:00",
          "paidAt": "2026-06-08T11:18:13+09:00",
          "status": "FINAL_DELIVERY",
          "orderer": {
            "name": "Coupang Buyer",
            "email": "buyer@example.com",
            "safeNumber": "010-1000-0022"
          },
          "receiver": {
            "name": "Coupang Receiver",
            "safeNumber": "010-2000-0022",
            "addr1": "Gyeonggi Osan-si",
            "addr2": "109-1001",
            "postCode": "18100"
          },
          "shippingPrice": {
            "currencyCode": "KRW",
            "units": 5000
          },
          "deliveryCompanyName": "CJ Logistics",
          "invoiceNumber": "340010913442",
          "orderItems": [
            {
              "vendorItemId": "3242596358",
              "vendorItemName": "Coupang Mock Product, Dark Grey, 160",
              "sellerProductId": "80240831",
              "sellerProductName": "Coupang Seller Product",
              "externalVendorSkuCode": "170816368810",
              "shippingCount": 1,
              "orderPrice": {
                "currencyCode": "KRW",
                "units": 19000
              },
              "discountPrice": {
                "currencyCode": "KRW",
                "units": 3000
              }
            }
          ]
        }'::jsonb
    ),
    (
        1,
        'gchan-mock-0001',
        'MOCK_GCHAN_20260608_20260608_admin',
        'GCHAN',
        'GCHAN',
        'S20260329000001',
        'PAID',
        NULL,
        NULL,
        '2026-04-01 09:55:00+09',
        '2026-04-01 09:55:00+09',
        'Gift Sender',
        NULL,
        NULL,
        'CARD',
        50000,
        50000,
        NULL,
        0,
        '{
          "recipientId": 1,
          "giftSendId": 100,
          "itemId": 50,
          "orderCode": "S20260329000001",
          "recipientName": "Gift Receiver",
          "recipientPhone": "01012345678",
          "receivedStatus": "RECEIVED",
          "quantity": 1,
          "totalPrice": 50000,
          "deliveryStatus": "SHIPPED",
          "address1": "Seoul Gangnam-gu",
          "address2": "101-202",
          "deliveryName": "Gift Receiver",
          "deliveryPhone": "01012345678",
          "productName": "Premium Gift Set",
          "giftSupplyPrice": 35000,
          "senderFullName": "Gift Sender",
          "paidAt": "2026-04-01T09:55:00",
          "paymentStatus": "PAID",
          "paymentMethod": "CARD",
          "trackingNumber": "1234567890",
          "carrierCode": "CJ Logistics",
          "orderDeliveryStatus": "SHIPPING"
        }'::jsonb
    ),
    (
        1,
        'godo-mock-0001',
        'MOCK_GODO_20260608_20260608_admin',
        'GODO',
        'GODO',
        '250608000001',
        'p1',
        NULL,
        NULL,
        '2026-06-08 12:30:00+09',
        '2026-06-08 12:32:00+09',
        'Godo Buyer',
        '010-1000-0033',
        'godo@example.com',
        'pc',
        72000,
        69000,
        3000,
        0,
        '{
          "orderNo": "250608000001",
          "orderStatus": "p1",
          "orderChannel": "shop",
          "settleKind": "pc",
          "orderName": "Godo Buyer",
          "orderCellPhone": "010-1000-0033",
          "orderEmail": "godo@example.com",
          "receiverName": "Godo Receiver",
          "receiverCellPhone": "010-2000-0033",
          "receiverZonecode": "04524",
          "receiverAddress": "Seoul Jung-gu",
          "receiverAddressSub": "10F",
          "orderGoodsData": [
            {
              "sno": 7771,
              "goodsNo": "GD-10001",
              "goodsNm": "Godo Mock Goods",
              "optionInfo": "Color: Navy / Size: L",
              "goodsCnt": 2,
              "goodsPrice": 34500,
              "goodsDiscount": 0,
              "goodsDeliveryCollectFl": "pre"
            }
          ],
          "orderDeliveryData": {
            "deliveryCompany": "CJ Logistics",
            "invoiceNo": "555566667777",
            "deliveryStatus": "d1"
          }
        }'::jsonb
    )
    ON CONFLICT (channel_cd, channel_order_id) DO UPDATE
    SET order_status = EXCLUDED.order_status,
        claim_status = EXCLUDED.claim_status,
        claim_type = EXCLUDED.claim_type,
        order_date = EXCLUDED.order_date,
        paid_at = EXCLUDED.paid_at,
        buyer_name = EXCLUDED.buyer_name,
        buyer_tel = EXCLUDED.buyer_tel,
        buyer_email = EXCLUDED.buyer_email,
        payment_method = EXCLUDED.payment_method,
        order_amount = EXCLUDED.order_amount,
        product_amount = EXCLUDED.product_amount,
        delivery_fee = EXCLUDED.delivery_fee,
        discount_amount = EXCLUDED.discount_amount,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
    RETURNING id, channel_cd, channel_order_id
)
SELECT * FROM upsert_order;

INSERT INTO hub_collected_order_item (
    order_id,
    channel_order_item_id,
    product_id,
    seller_product_code,
    sku_code,
    product_name,
    option_name,
    item_status,
    quantity,
    unit_price,
    item_amount,
    discount_amount,
    expected_settlement_amount,
    raw_payload
)
SELECT o.id, v.channel_order_item_id, v.product_id, v.seller_product_code, v.sku_code,
       v.product_name, v.option_name, v.item_status, v.quantity, v.unit_price,
       v.item_amount, v.discount_amount, v.expected_settlement_amount, v.raw_payload::jsonb
FROM hub_collected_order o
JOIN (
    VALUES
    ('NAVER', 'NAVER-ORDER-20260608-0001', 'NAVER-PRODUCT-ORDER-0001', 'NAVER-PROD-10001', 'SELLER-NAVER-001', 'NS-SKU-001', 'Naver SmartStore Mock Product', 'Color: Black / Size: M', 'PAYED', 2, 21000, 42000, 1000, 41000, '{"productOrderId":"NAVER-PRODUCT-ORDER-0001"}'),
    ('11ST', '201001108318120', '201001108318120-1', '29370295', '000000000133275', '43434232', '11ST Mock Product', 'Size: S / Color: Ivory', 'PAYMENT_COMPLETE', 1, 19000, 19000, 2690, 16310, '{"ordPrdSeq":1,"prdNo":"29370295"}'),
    ('COUPANG', '22000009546234', '3242596358', '80240831', '170816368810', '3242596358', 'Coupang Mock Product, Dark Grey, 160', 'Dark Grey / 160', 'FINAL_DELIVERY', 1, 19000, 19000, 3000, 16000, '{"vendorItemId":"3242596358","sellerProductId":"80240831"}'),
    ('GCHAN', 'S20260329000001', 'recipient-1-item-50', '50', NULL, NULL, 'Premium Gift Set', 'Red', 'RECEIVED', 1, 50000, 50000, 0, 35000, '{"recipientId":1,"itemId":50}'),
    ('GODO', '250608000001', '7771', 'GD-10001', NULL, NULL, 'Godo Mock Goods', 'Color: Navy / Size: L', 'p1', 2, 34500, 69000, 0, NULL, '{"sno":7771,"goodsNo":"GD-10001"}')
) AS v(channel_cd, channel_order_id, channel_order_item_id, product_id, seller_product_code, sku_code, product_name, option_name, item_status, quantity, unit_price, item_amount, discount_amount, expected_settlement_amount, raw_payload)
ON o.channel_cd = v.channel_cd AND o.channel_order_id = v.channel_order_id
ON CONFLICT (order_id, channel_order_item_id) DO UPDATE
SET product_id = EXCLUDED.product_id,
    seller_product_code = EXCLUDED.seller_product_code,
    sku_code = EXCLUDED.sku_code,
    product_name = EXCLUDED.product_name,
    option_name = EXCLUDED.option_name,
    item_status = EXCLUDED.item_status,
    quantity = EXCLUDED.quantity,
    unit_price = EXCLUDED.unit_price,
    item_amount = EXCLUDED.item_amount,
    discount_amount = EXCLUDED.discount_amount,
    expected_settlement_amount = EXCLUDED.expected_settlement_amount,
    raw_payload = EXCLUDED.raw_payload,
    updated_at = NOW();

INSERT INTO hub_collected_order_delivery (
    order_id,
    receiver_name,
    receiver_tel,
    receiver_zip_code,
    receiver_addr1,
    receiver_addr2,
    delivery_memo,
    delivery_company,
    tracking_number,
    delivery_status,
    shipping_due_at,
    shipped_at,
    delivered_at,
    raw_payload
)
SELECT o.id, v.receiver_name, v.receiver_tel, v.receiver_zip_code, v.receiver_addr1,
       v.receiver_addr2, v.delivery_memo, v.delivery_company, v.tracking_number,
       v.delivery_status, v.shipping_due_at::timestamptz, v.shipped_at::timestamptz,
       v.delivered_at::timestamptz, v.raw_payload::jsonb
FROM hub_collected_order o
JOIN (
    VALUES
    ('NAVER', 'NAVER-ORDER-20260608-0001', 'Naver Receiver', '010-2000-0001', '06100', 'Seoul Gangnam-gu', '101-1001', 'Leave at door', 'NAVER_EXPECTED', NULL, 'READY', '2026-06-09 18:00:00+09', NULL, NULL, '{"shippingAddress":{"baseAddress":"Seoul Gangnam-gu"}}'),
    ('11ST', '201001108318120', '11ST Receiver', '010-2000-0011', '360100', 'Chungbuk Cheongju', '8809', NULL, NULL, NULL, 'READY', '2026-06-09 18:00:00+09', NULL, NULL, '{"rcvrMailNo":"360100"}'),
    ('COUPANG', '22000009546234', 'Coupang Receiver', '010-2000-0022', '18100', 'Gyeonggi Osan-si', '109-1001', 'Door front', 'CJ Logistics', '340010913442', 'FINAL_DELIVERY', NULL, '2026-06-08 13:00:00+09', '2026-06-09 14:00:00+09', '{"shipmentBoxId":"642538970006401429"}'),
    ('GCHAN', 'S20260329000001', 'Gift Receiver', '01012345678', NULL, 'Seoul Gangnam-gu', '101-202', NULL, 'CJ Logistics', '1234567890', 'SHIPPING', NULL, '2026-04-02 09:00:00+09', NULL, '{"carrierId":4}'),
    ('GODO', '250608000001', 'Godo Receiver', '010-2000-0033', '04524', 'Seoul Jung-gu', '10F', 'Call before delivery', 'CJ Logistics', '555566667777', 'd1', NULL, '2026-06-08 16:00:00+09', NULL, '{"deliveryStatus":"d1"}')
) AS v(channel_cd, channel_order_id, receiver_name, receiver_tel, receiver_zip_code, receiver_addr1, receiver_addr2, delivery_memo, delivery_company, tracking_number, delivery_status, shipping_due_at, shipped_at, delivered_at, raw_payload)
ON o.channel_cd = v.channel_cd AND o.channel_order_id = v.channel_order_id
ON CONFLICT (order_id) DO UPDATE
SET receiver_name = EXCLUDED.receiver_name,
    receiver_tel = EXCLUDED.receiver_tel,
    receiver_zip_code = EXCLUDED.receiver_zip_code,
    receiver_addr1 = EXCLUDED.receiver_addr1,
    receiver_addr2 = EXCLUDED.receiver_addr2,
    delivery_memo = EXCLUDED.delivery_memo,
    delivery_company = EXCLUDED.delivery_company,
    tracking_number = EXCLUDED.tracking_number,
    delivery_status = EXCLUDED.delivery_status,
    shipping_due_at = EXCLUDED.shipping_due_at,
    shipped_at = EXCLUDED.shipped_at,
    delivered_at = EXCLUDED.delivered_at,
    raw_payload = EXCLUDED.raw_payload,
    updated_at = NOW();

INSERT INTO hub_collected_order_claim (
    order_id,
    order_item_id,
    channel_claim_id,
    claim_type,
    claim_status,
    claim_reason,
    claim_requested_at,
    claim_completed_at,
    claim_quantity,
    refund_amount,
    raw_payload
)
SELECT o.id, i.id, v.channel_claim_id, v.claim_type, v.claim_status, v.claim_reason,
       v.claim_requested_at::timestamptz, v.claim_completed_at::timestamptz,
       v.claim_quantity, v.refund_amount, v.raw_payload::jsonb
FROM hub_collected_order o
JOIN hub_collected_order_item i ON i.order_id = o.id
JOIN (
    VALUES
    ('NAVER', 'NAVER-ORDER-20260608-0001', 'NAVER-PRODUCT-ORDER-0001', 'NAVER-CLAIM-0001', 'CANCEL', 'CANCEL_REQUEST', 'Customer request', '2026-06-08 15:10:00+09', NULL, 1, 21000, '{"claimType":"CANCEL","claimStatus":"CANCEL_REQUEST"}')
) AS v(channel_cd, channel_order_id, channel_order_item_id, channel_claim_id, claim_type, claim_status, claim_reason, claim_requested_at, claim_completed_at, claim_quantity, refund_amount, raw_payload)
ON o.channel_cd = v.channel_cd
AND o.channel_order_id = v.channel_order_id
AND i.channel_order_item_id = v.channel_order_item_id
ON CONFLICT (order_id, channel_claim_id) DO UPDATE
SET order_item_id = EXCLUDED.order_item_id,
    claim_type = EXCLUDED.claim_type,
    claim_status = EXCLUDED.claim_status,
    claim_reason = EXCLUDED.claim_reason,
    claim_requested_at = EXCLUDED.claim_requested_at,
    claim_completed_at = EXCLUDED.claim_completed_at,
    claim_quantity = EXCLUDED.claim_quantity,
    refund_amount = EXCLUDED.refund_amount,
    raw_payload = EXCLUDED.raw_payload,
    updated_at = NOW();

INSERT INTO hub_collected_order_raw (
    request_id,
    request_key,
    channel_cd,
    mall_key,
    fr_dt,
    to_dt,
    raw_format,
    raw_payload
) VALUES
('naver-mock-0001', 'MOCK_NAVER_20260608_20260608_admin', 'NAVER', 'NAVER', '20260608', '20260608', 'JSON', '{"data":{"contents":[{"productOrderId":"NAVER-PRODUCT-ORDER-0001"}]}}'),
('st11-mock-0001', 'MOCK_11ST_20260608_20260608_admin', '11ST', '11ST', '20260608', '20260608', 'XML', '<orders><order><ordNo>201001108318120</ordNo></order></orders>'),
('coupang-mock-0001', 'MOCK_COUPANG_20260608_20260608_admin', 'COUPANG', 'COUPANG', '20260608', '20260608', 'JSON', '{"code":200,"data":[{"orderId":"22000009546234"}]}'),
('gchan-mock-0001', 'MOCK_GCHAN_20260608_20260608_admin', 'GCHAN', 'GCHAN', '20260401', '20260401', 'JSON', '{"data":{"list":[{"orderCode":"S20260329000001"}]}}'),
('godo-mock-0001', 'MOCK_GODO_20260608_20260608_admin', 'GODO', 'GODO', '20260608', '20260608', 'JSON', '{"order_data":[{"orderNo":"250608000001"}]}');
