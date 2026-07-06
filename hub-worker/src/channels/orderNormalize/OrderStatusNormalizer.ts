import { firstNonBlank } from "./normalizeUtils.js";

export type CommonOrderStatus =
  | "결제대기"
  | "주문접수"
  | "결제완료"
  | "주문완료"
  | "상품준비중"
  | "배송준비"
  | "배송중"
  | "배송완료"
  | "구매확정"
  | "취소접수"
  | "취소완료"
  | "반품접수"
  | "반품완료"
  | "교환접수"
  | "교환중"
  | "교환완료"
  | "미결제취소"
  | "상태확인필요";

type StatusDefinition = {
  status: CommonOrderStatus;
  priority: number;
};

const STATUS_DEFINITIONS: Record<string, StatusDefinition> = {};

register("결제대기", 10, "PAYMENT_PENDING", "WAITING_FOR_PAY", "WAITING_PAYMENT", "미결제", "결제대기");
register("주문접수", 15, "ORDER_RECEIVED", "ORDER_ACCEPTED", "O1", "주문접수");
register("결제완료", 20, "PAID", "PAYED", "PAYMENT_COMPLETE", "PAYMENT_COMPLETED", "P1", "ACCEPT", "결제완료");
register("주문완료", 25, "ORDER_CONFIRMED", "RECEIVED", "주문완료", "주문확인");
register("상품준비중", 30, "READY_TO_SHIP", "PRODUCT_PREPARATION", "PREPARING_PRODUCT", "INSTRUCT", "G1", "READY", "상품준비중", "상품_준비중", "발주확인");
register("배송준비", 35, "READY_FOR_DELIVERY", "DELIVERY_READY", "배송대기", "배송준비", "배송준비중");
register("배송중", 40, "SHIPPED", "SHIPPING", "DELIVERING", "DEPARTURE", "DELIVERY_IN_PROGRESS", "D1", "배송중", "발송완료");
register("배송완료", 50, "DELIVERED", "FINAL_DELIVERY", "DELIVERY_COMPLETE", "DELIVERY_COMPLETED", "COMPLETED", "D2", "배송완료");
register("구매확정", 60, "PURCHASE_DECIDED", "PURCHASE_CONFIRMED", "구매확정");
register("취소접수", 80, "CANCEL_REQUESTED", "CANCEL_REQUEST", "C1", "취소요청", "취소접수");
register("취소완료", 90, "CANCELLED", "CANCELED", "CANCEL_COMPLETE", "CANCEL_COMPLETED", "C2", "취소", "취소완료");
register("반품접수", 80, "RETURN_REQUESTED", "RETURN_REQUEST", "B1", "반품요청", "반품접수");
register("반품완료", 90, "RETURNED", "RETURN_COMPLETE", "RETURN_COMPLETED", "B2", "반품완료");
register("교환접수", 80, "EXCHANGE_REQUESTED", "EXCHANGE_REQUEST", "E1", "교환요청", "교환접수");
register("교환중", 85, "EXCHANGE_SHIPPING", "EXCHANGING", "교환중");
register("교환완료", 90, "EXCHANGED", "EXCHANGE_DELIVERED", "EXCHANGE_COMPLETE", "EXCHANGE_COMPLETED", "E2", "교환완료");
register("미결제취소", 90, "PAYMENT_TIMEOUT_CANCELLED", "PAYMENT_TIMEOUT_CANCELED", "CANCELED_BY_NOPAYMENT", "미결제취소");

export function normalizeOrderStatus(...values: Array<string | null | undefined>): CommonOrderStatus {
  const candidates = values
    .map((value) => firstNonBlank(value))
    .filter((value): value is string => value !== null);

  let selected: StatusDefinition | null = null;
  for (const candidate of candidates) {
    const definition = STATUS_DEFINITIONS[normalizeKey(candidate)];
    if (definition && (!selected || definition.priority > selected.priority)) {
      selected = definition;
    }
  }

  return selected?.status ?? "상태확인필요";
}

function register(status: CommonOrderStatus, priority: number, ...aliases: string[]): void {
  for (const alias of aliases) {
    STATUS_DEFINITIONS[normalizeKey(alias)] = { status, priority };
  }
}

function normalizeKey(value: string): string {
  return value.trim().replace(/[\s-]+/g, "_").toUpperCase();
}
