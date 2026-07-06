const INITIAL_COLLECTION_STATUSES = new Set([
  "결제완료",
  "주문완료",
  "상품준비중",
  "배송준비"
]);

export function isInitialCollectionStatus(status: string | null | undefined): boolean {
  return typeof status === "string" && INITIAL_COLLECTION_STATUSES.has(status);
}

export function initialCollectionStatuses(): string[] {
  return [...INITIAL_COLLECTION_STATUSES];
}
