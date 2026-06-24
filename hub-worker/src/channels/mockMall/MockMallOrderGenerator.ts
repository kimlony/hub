export const MOCK_MALL_CHANNEL_CD = "MOCK_MALL";
export const DEFAULT_MOCK_MALL_KEY = "mock-mall-001";
export const DEFAULT_MOCK_MALL_SEED = "mock-mall-default";

export type MockMallOrderStatus = "PAID" | "READY_TO_SHIP" | "SHIPPED" | "CANCELLED";

export type MockMallOrderItem = {
  channelOrderItemId: string;
  productId: string;
  productName: string;
  optionName: string;
  quantity: number;
  unitPrice: number;
  itemAmount: number;
};

export type MockMallOrder = {
  channelCd: typeof MOCK_MALL_CHANNEL_CD;
  mallKey: string;
  orderNo: string;
  orderedAt: string;
  paidAt: string | null;
  orderStatus: MockMallOrderStatus;
  buyerName: string;
  buyerTel: string;
  buyerEmail: string;
  paymentMethod: string;
  orderAmount: number;
  productAmount: number;
  deliveryFee: number;
  discountAmount: number;
  items: MockMallOrderItem[];
  receiverName: string;
  receiverTel: string;
  receiverZipCode: string;
  receiverAddr1: string;
  receiverAddr2: string;
  deliveryMemo: string;
};

export type GenerateMockMallOrdersInput = {
  page?: number;
  size?: number;
  totalCount?: number;
  seed?: string;
  mallKey?: string;
};

export type GenerateMockMallOrdersResult = {
  channelCd: typeof MOCK_MALL_CHANNEL_CD;
  mallKey: string;
  page: number;
  size: number;
  totalCount: number;
  seed: string;
  hasNext: boolean;
  orders: MockMallOrder[];
};

const statusBuckets: Array<{ status: MockMallOrderStatus; limit: number }> = [
  { status: "PAID", limit: 45 },
  { status: "READY_TO_SHIP", limit: 75 },
  { status: "SHIPPED", limit: 95 },
  { status: "CANCELLED", limit: 100 }
];

const productNames = [
  "Daily Cotton Shirt",
  "Urban Slim Denim",
  "Light Runner Sneakers",
  "Modern Cross Bag",
  "Essential Hoodie",
  "Minimal Desk Lamp",
  "Stainless Tumbler",
  "Wireless Keyboard"
];

const optionNames = ["Black / M", "White / L", "Navy / Free", "Gray / 260", "Ivory / Set"];
const paymentMethods = ["CARD", "BANK_TRANSFER", "EASY_PAY"];
const cities = ["Seoul", "Busan", "Incheon", "Daegu", "Daejeon", "Gwangju", "Suwon", "Seongnam"];

export function generateMockMallOrders(input: GenerateMockMallOrdersInput = {}): GenerateMockMallOrdersResult {
  const page = positiveInteger(input.page, 1);
  const size = positiveInteger(input.size, 100);
  const totalCount = nonNegativeInteger(input.totalCount, 10000);
  const seed = nonBlank(input.seed, DEFAULT_MOCK_MALL_SEED);
  const mallKey = nonBlank(input.mallKey, DEFAULT_MOCK_MALL_KEY);
  const startIndex = (page - 1) * size + 1;

  if (startIndex > totalCount || totalCount === 0) {
    return {
      channelCd: MOCK_MALL_CHANNEL_CD,
      mallKey,
      page,
      size,
      totalCount,
      seed,
      hasNext: false,
      orders: []
    };
  }

  const endIndex = Math.min(startIndex + size - 1, totalCount);
  const orders = Array.from({ length: endIndex - startIndex + 1 }, (_, index) =>
    createOrder(startIndex + index, { seed, mallKey })
  );

  return {
    channelCd: MOCK_MALL_CHANNEL_CD,
    mallKey,
    page,
    size,
    totalCount,
    seed,
    hasNext: endIndex < totalCount,
    orders
  };
}

function createOrder(globalIndex: number, context: { seed: string; mallKey: string }): MockMallOrder {
  const random = seededRandom(`${context.seed}:${globalIndex}`);
  const itemCount = 1 + Math.floor(random() * 3);
  const orderNo = `MOCK-ORDER-${String(globalIndex).padStart(6, "0")}`;
  const orderedAt = orderedAtFor(globalIndex);
  const items = Array.from({ length: itemCount }, (_, index) => createItem(globalIndex, index + 1, random));
  const productAmount = items.reduce((sum, item) => sum + item.itemAmount, 0);
  const deliveryFee = productAmount >= 50000 ? 0 : 3000;
  const discountAmount = Math.floor(random() * 5) * 500;
  const orderAmount = Math.max(productAmount + deliveryFee - discountAmount, 0);
  const status = statusFor(random);
  const buyerNo = 100000 + globalIndex;
  const city = pick(cities, random);

  return {
    channelCd: MOCK_MALL_CHANNEL_CD,
    mallKey: context.mallKey,
    orderNo,
    orderedAt,
    paidAt: status === "CANCELLED" ? null : orderedAt,
    orderStatus: status,
    buyerName: `Mock Buyer ${buyerNo}`,
    buyerTel: `010-${String(1000 + (globalIndex % 9000)).padStart(4, "0")}-${String(2000 + (globalIndex % 8000)).padStart(4, "0")}`,
    buyerEmail: `buyer${buyerNo}@mock-mall.test`,
    paymentMethod: pick(paymentMethods, random),
    orderAmount,
    productAmount,
    deliveryFee,
    discountAmount,
    items,
    receiverName: `Receiver ${buyerNo}`,
    receiverTel: `010-${String(3000 + (globalIndex % 7000)).padStart(4, "0")}-${String(4000 + (globalIndex % 6000)).padStart(4, "0")}`,
    receiverZipCode: String(10000 + (globalIndex % 80000)),
    receiverAddr1: `${city} Mock-ro ${1 + (globalIndex % 200)}`,
    receiverAddr2: `${1 + (globalIndex % 30)}F-${100 + (globalIndex % 900)}`,
    deliveryMemo: globalIndex % 5 === 0 ? "Leave at the door" : "Call before delivery"
  };
}

function createItem(globalIndex: number, itemIndex: number, random: () => number): MockMallOrderItem {
  const productId = `MOCK-PRODUCT-${String(1 + Math.floor(random() * 500)).padStart(5, "0")}`;
  const quantity = 1 + Math.floor(random() * 4);
  const unitPrice = (10 + Math.floor(random() * 90)) * 1000;

  return {
    channelOrderItemId: `MOCK-ORDER-${String(globalIndex).padStart(6, "0")}-${itemIndex}`,
    productId,
    productName: pick(productNames, random),
    optionName: pick(optionNames, random),
    quantity,
    unitPrice,
    itemAmount: quantity * unitPrice
  };
}

function statusFor(random: () => number): MockMallOrderStatus {
  const value = Math.floor(random() * 100);
  return statusBuckets.find((bucket) => value < bucket.limit)?.status ?? "PAID";
}

function orderedAtFor(globalIndex: number): string {
  const base = Date.UTC(2026, 0, 1, 0, 0, 0);
  const date = new Date(base + (globalIndex - 1) * 60_000);
  return date.toISOString();
}

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] ?? items[0];
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function nonBlank(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function seededRandom(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
