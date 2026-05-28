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
  orderedAt: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  receiverZipCode: string;
  deliveryMessage: string;
  totalPrice: number;
  items: CoupangOrderItem[];
};
