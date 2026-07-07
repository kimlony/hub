import { CoupangOrderStatusClient } from "../coupang/CoupangOrderStatusClient.js";
import { ElevenStOrderStatusClient } from "../elevenst/ElevenStOrderStatusClient.js";
import { GchanOrderStatusClient } from "../gchan/GchanOrderStatusClient.js";
import { GodoOrderStatusClient } from "../godo/GodoOrderStatusClient.js";
import { MockMallOrderStatusClient } from "../mockMall/MockMallOrderStatusClient.js";
import { OnryOrderStatusClient } from "../onry/OnryOrderStatusClient.js";
import { WchanOrderStatusClient } from "../wchan/WchanOrderStatusClient.js";
import { OrderStatusClientRegistry } from "./OrderStatusClientRegistry.js";

export function createOrderStatusClientRegistry(): OrderStatusClientRegistry {
  const registry = new OrderStatusClientRegistry();
  registry.register("MOCK_MALL", new MockMallOrderStatusClient());
  registry.register("11ST", new ElevenStOrderStatusClient());
  registry.register("COUPANG", new CoupangOrderStatusClient());
  registry.register("GODO", new GodoOrderStatusClient());
  registry.register("GCHAN", new GchanOrderStatusClient());
  registry.register("WCHAN", new WchanOrderStatusClient());
  registry.register("ONRY", new OnryOrderStatusClient());
  return registry;
}

