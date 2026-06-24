import { generateMockMallOrders } from "./MockMallOrderGenerator.js";

describe("generateMockMallOrders", () => {
  it("generates deterministic orders for the same page, size, totalCount, and seed", () => {
    const first = generateMockMallOrders({ page: 2, size: 3, totalCount: 10, seed: "fixed-seed" });
    const second = generateMockMallOrders({ page: 2, size: 3, totalCount: 10, seed: "fixed-seed" });

    expect(second).toEqual(first);
    expect(first.orders.map((order) => order.orderNo)).toEqual([
      "MOCK-ORDER-000004",
      "MOCK-ORDER-000005",
      "MOCK-ORDER-000006"
    ]);
  });

  it("returns an empty final page when page is beyond totalCount", () => {
    const result = generateMockMallOrders({ page: 4, size: 5, totalCount: 12, seed: "empty-page" });

    expect(result.orders).toEqual([]);
    expect(result.hasNext).toBe(false);
  });

  it("limits the final page and marks hasNext false", () => {
    const result = generateMockMallOrders({ page: 3, size: 5, totalCount: 12, seed: "last-page" });

    expect(result.orders).toHaveLength(2);
    expect(result.orders.map((order) => order.orderNo)).toEqual([
      "MOCK-ORDER-000011",
      "MOCK-ORDER-000012"
    ]);
    expect(result.hasNext).toBe(false);
  });

  it("generates one to three items with calculated amounts", () => {
    const result = generateMockMallOrders({ page: 1, size: 20, totalCount: 20, seed: "items" });

    for (const order of result.orders) {
      expect(order.items.length).toBeGreaterThanOrEqual(1);
      expect(order.items.length).toBeLessThanOrEqual(3);
      const productAmount = order.items.reduce((sum, item) => sum + item.itemAmount, 0);
      expect(order.productAmount).toBe(productAmount);
      expect(order.orderAmount).toBe(order.productAmount + order.deliveryFee - order.discountAmount);
    }
  });
});
