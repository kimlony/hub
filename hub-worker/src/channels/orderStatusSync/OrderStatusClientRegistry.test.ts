import { jest } from "@jest/globals";
import { OrderStatusClientRegistry } from "./OrderStatusClientRegistry.js";
import { createOrderStatusClientRegistry } from "./createOrderStatusClientRegistry.js";

describe("OrderStatusClientRegistry", () => {
  it("returns a registered client case-insensitively", async () => {
    const client = { fetchOrderStatuses: jest.fn(async () => []) };
    const registry = new OrderStatusClientRegistry();
    registry.register("MOCK_MALL", client);

    expect(registry.get("mock_mall")).toBe(client);
  });

  it("registers status sync adapters for supported mall channels", () => {
    const registry = createOrderStatusClientRegistry();

    for (const channelCd of ["MOCK_MALL", "11ST", "COUPANG", "GODO", "GCHAN", "WCHAN", "ONRY"]) {
      expect(registry.get(channelCd)).toBeDefined();
    }
  });
});

