import { HandlerRegistry } from "./HandlerRegistry.js";
import type { IJobHandler, JobHandlerMessage } from "./IJobHandler.js";

function createHandler(name: string): IJobHandler {
  return {
    async handle(_message: JobHandlerMessage): Promise<void> {
      void name;
    }
  };
}

describe("HandlerRegistry", () => {
  it("returns the handler registered for a jobType and channelCd", () => {
    const registry = new HandlerRegistry();
    const handler = createHandler("godo");

    registry.register("ORDER_COLLECT", handler, "GODO");

    expect(registry.get("ORDER_COLLECT", "GODO")).toBe(handler);
  });

  it("throws for an unregistered channelCd", () => {
    const registry = new HandlerRegistry();
    registry.register("ORDER_COLLECT", createHandler("godo"), "GODO");

    expect(() => registry.get("ORDER_COLLECT", "COUPANG")).toThrow(
      "Unsupported jobType/channelCd: ORDER_COLLECT/COUPANG"
    );
  });

  it("throws for an unregistered jobType", () => {
    const registry = new HandlerRegistry();
    registry.register("ORDER_COLLECT", createHandler("godo"), "GODO");

    expect(() => registry.get("INVOICE_SEND", "GODO")).toThrow(
      "Unsupported jobType/channelCd: INVOICE_SEND/GODO"
    );
  });

  it("returns the correct handler for multiple channels on the same jobType", () => {
    const registry = new HandlerRegistry();
    const godoHandler = createHandler("godo");
    const coupangHandler = createHandler("coupang");

    registry.register("ORDER_COLLECT", godoHandler, "GODO");
    registry.register("ORDER_COLLECT", coupangHandler, "COUPANG");

    expect(registry.get("ORDER_COLLECT", "GODO")).toBe(godoHandler);
    expect(registry.get("ORDER_COLLECT", "COUPANG")).toBe(coupangHandler);
  });
});
