import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MockMallFixtureStore, validateFixtureFileName } from "./MockMallFixtureStore.js";

describe("MockMallFixtureStore", () => {
  let fixtureDirectory: string;

  beforeEach(async () => {
    fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), "hub-mock-fixture-"));
    await writeFile(path.join(fixtureDirectory, "orders.json"), JSON.stringify({
      fixtureVersion: 1,
      orders: [order("FIXTURE-1"), order("FIXTURE-2"), order("FIXTURE-3")]
    }));
  });

  afterEach(async () => {
    await rm(fixtureDirectory, { recursive: true, force: true });
  });

  it("returns a fixture as a paged MOCK_MALL API response", async () => {
    const result = await new MockMallFixtureStore(fixtureDirectory).fetchOrders({
      fixtureFile: "orders.json",
      page: 2,
      size: 2,
      mallKey: "demo-mall"
    });

    expect(result.totalCount).toBe(3);
    expect(result.hasNext).toBe(false);
    expect(result.orders.map((item) => item.orderNo)).toEqual(["FIXTURE-3"]);
    expect(result.orders[0].mallKey).toBe("demo-mall");
  });

  it("rejects traversal and non-JSON fixture names", () => {
    expect(() => validateFixtureFileName("../orders.json")).toThrow("fixtureFile");
    expect(() => validateFixtureFileName("orders.xlsx")).toThrow("fixtureFile");
  });
});

function order(orderNo: string) {
  return {
    orderNo,
    orderedAt: "2026-07-15T00:00:00.000Z",
    paidAt: "2026-07-15T00:00:00.000Z",
    orderStatus: "PAID",
    orderAmount: 13000,
    productAmount: 10000,
    deliveryFee: 3000,
    discountAmount: 0,
    items: [{
      channelOrderItemId: `${orderNo}-1`,
      productId: "PRODUCT-1",
      productName: "Fixture Product",
      optionName: "Default",
      quantity: 1,
      unitPrice: 10000,
      itemAmount: 10000
    }]
  };
}
