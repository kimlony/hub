BEGIN;

WITH status_source AS (
    SELECT
        id,
        array_remove(ARRAY[
            upper(nullif(order_status, '')),
            upper(nullif(raw_payload->>'orderStatus', '')),
            upper(nullif(raw_payload->>'status', '')),
            upper(nullif(raw_payload->>'ordStatus', '')),
            upper(nullif(raw_payload->>'ordStatNm', '')),
            upper(nullif(raw_payload->>'ordStatCd', '')),
            upper(nullif(raw_payload->>'productOrderStatus', '')),
            upper(nullif(raw_payload#>>'{productOrder,productOrderStatus}', '')),
            upper(nullif(raw_payload->>'paymentStatus', '')),
            upper(nullif(raw_payload->>'receivedStatus', '')),
            upper(nullif(raw_payload->>'orderDeliveryStatus', '')),
            upper(nullif(raw_payload->>'deliveryStatus', ''))
        ], NULL) AS statuses
    FROM hub_collected_order
), mapped_status AS (
    SELECT
        id,
        CASE
            WHEN statuses && ARRAY['PAYMENT_TIMEOUT_CANCELLED', 'PAYMENT_TIMEOUT_CANCELED', 'CANCELED_BY_NOPAYMENT', '미결제취소'] THEN '미결제취소'
            WHEN statuses && ARRAY['CANCELLED', 'CANCELED', 'CANCEL_COMPLETE', 'CANCEL_COMPLETED', 'C2', '취소', '취소완료'] THEN '취소완료'
            WHEN statuses && ARRAY['RETURNED', 'RETURN_COMPLETE', 'RETURN_COMPLETED', 'B2', '반품완료'] THEN '반품완료'
            WHEN statuses && ARRAY['EXCHANGED', 'EXCHANGE_DELIVERED', 'EXCHANGE_COMPLETE', 'EXCHANGE_COMPLETED', 'E2', '교환완료'] THEN '교환완료'
            WHEN statuses && ARRAY['EXCHANGE_SHIPPING', 'EXCHANGING', '교환중'] THEN '교환중'
            WHEN statuses && ARRAY['CANCEL_REQUESTED', 'CANCEL_REQUEST', 'C1', '취소요청', '취소접수'] THEN '취소접수'
            WHEN statuses && ARRAY['RETURN_REQUESTED', 'RETURN_REQUEST', 'B1', '반품요청', '반품접수'] THEN '반품접수'
            WHEN statuses && ARRAY['EXCHANGE_REQUESTED', 'EXCHANGE_REQUEST', 'E1', '교환요청', '교환접수'] THEN '교환접수'
            WHEN statuses && ARRAY['PURCHASE_DECIDED', 'PURCHASE_CONFIRMED', '구매확정'] THEN '구매확정'
            WHEN statuses && ARRAY['DELIVERED', 'FINAL_DELIVERY', 'DELIVERY_COMPLETE', 'DELIVERY_COMPLETED', 'COMPLETED', 'D2', '배송완료'] THEN '배송완료'
            WHEN statuses && ARRAY['SHIPPED', 'SHIPPING', 'DELIVERING', 'DEPARTURE', 'DELIVERY_IN_PROGRESS', 'D1', '배송중', '발송완료'] THEN '배송중'
            WHEN statuses && ARRAY['READY_FOR_DELIVERY', 'DELIVERY_READY', '배송대기', '배송준비'] THEN '배송준비'
            WHEN statuses && ARRAY['READY_TO_SHIP', 'PRODUCT_PREPARATION', 'PREPARING_PRODUCT', 'INSTRUCT', 'G1', 'READY', '상품준비중', '상품 준비중'] THEN '상품준비중'
            WHEN statuses && ARRAY['ORDER_CONFIRMED', 'RECEIVED', '주문완료', '주문확인'] THEN '주문완료'
            WHEN statuses && ARRAY['PAID', 'PAYED', 'PAYMENT_COMPLETE', 'PAYMENT_COMPLETED', 'P1', 'ACCEPT', '결제완료'] THEN '결제완료'
            WHEN statuses && ARRAY['ORDER_RECEIVED', 'ORDER_ACCEPTED', 'O1', '주문접수'] THEN '주문접수'
            WHEN statuses && ARRAY['PAYMENT_PENDING', 'WAITING_FOR_PAY', 'WAITING_PAYMENT', '미결제', '결제대기'] THEN '결제대기'
            ELSE '상태확인필요'
        END AS common_status
    FROM status_source
)
UPDATE hub_collected_order o
SET order_status = m.common_status,
    updated_at = now()
FROM mapped_status m
WHERE m.id = o.id
  AND o.order_status IS DISTINCT FROM m.common_status;

UPDATE hub_collected_order_item i
SET item_status = o.order_status,
    updated_at = now()
FROM hub_collected_order o
WHERE o.id = i.order_id
  AND i.item_status IS DISTINCT FROM o.order_status;

UPDATE hub_collected_order_delivery
SET delivery_status = CASE
        WHEN upper(nullif(delivery_status, '')) IN ('DELIVERED', 'FINAL_DELIVERY', 'DELIVERY_COMPLETE', 'DELIVERY_COMPLETED', 'COMPLETED', 'D2', '배송완료') THEN '배송완료'
        WHEN upper(nullif(delivery_status, '')) IN ('SHIPPED', 'SHIPPING', 'DELIVERING', 'DEPARTURE', 'DELIVERY_IN_PROGRESS', 'D1', '배송중', '발송완료') THEN '배송중'
        WHEN upper(nullif(delivery_status, '')) IN ('READY_FOR_DELIVERY', 'DELIVERY_READY', '배송대기', '배송준비') THEN '배송준비'
        WHEN upper(nullif(delivery_status, '')) IN ('READY_TO_SHIP', 'PRODUCT_PREPARATION', 'PREPARING_PRODUCT', 'INSTRUCT', 'G1', 'READY', '상품준비중', '상품 준비중') THEN '상품준비중'
        ELSE '상태확인필요'
    END,
    updated_at = now();

COMMIT;
