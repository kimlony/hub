export type RawOrderContext = {
  corpId: number;
  channelAccountId: number;
  userId: number;
  requestId: string;
  requestKey: string;
  sourceErp: string;
  channelCd: string;
  mallKey: string;
};

export type NormalizedOrder = {
  channelOrderId: string;
  orderStatus?: string | null;
  orderDate?: Date | null;
  paidAt?: Date | null;
  buyerName?: string | null;
  buyerTel?: string | null;
  buyerEmail?: string | null;
  paymentMethod?: string | null;
  orderAmount?: number | null;
  productAmount?: number | null;
  deliveryFee?: number | null;
  discountAmount?: number | null;
  rawPayload: Record<string, unknown>;
  items: NormalizedOrderItem[];
  delivery?: NormalizedDelivery | null;
};

export type NormalizedOrderItem = {
  channelOrderItemId: string;
  productId?: string | null;
  sellerProductCode?: string | null;
  skuCode?: string | null;
  productName?: string | null;
  optionName?: string | null;
  itemStatus?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  itemAmount?: number | null;
  discountAmount?: number | null;
  expectedSettlementAmount?: number | null;
  rawPayload: Record<string, unknown>;
};

export type NormalizedDelivery = {
  receiverName?: string | null;
  receiverTel?: string | null;
  receiverZipCode?: string | null;
  receiverAddr1?: string | null;
  receiverAddr2?: string | null;
  deliveryMemo?: string | null;
  deliveryCompany?: string | null;
  trackingNumber?: string | null;
  deliveryStatus?: string | null;
  rawPayload: Record<string, unknown>;
};

export interface OrderNormalizer {
  supports(channelCd: string): boolean;
  normalize(order: Record<string, unknown>, context: RawOrderContext): NormalizedOrder | null;
}
