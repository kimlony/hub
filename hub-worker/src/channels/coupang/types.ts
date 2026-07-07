export type CoupangOrderItem = {
  orderItemId: string;
  productId: string;
  sellerProductName: string;
  itemName: string;
  quantity: number;
  orderPrice: number;
};

export type CoupangOrder = {
  orderId: string;
  orderStatus: string;
  status?: string;
  orderedAt: string;
  deliveryCompanyName?: string | null;
  invoiceNumber?: string | null;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  receiverZipCode: string;
  deliveryMessage: string;
  totalPrice: number;
  items: CoupangOrderItem[];
};
