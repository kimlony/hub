import type { OrderStatusClient } from "./OrderStatusClient.js";

export class OrderStatusClientRegistry {
  private readonly clients = new Map<string, OrderStatusClient>();

  register(channelCd: string, client: OrderStatusClient): void {
    this.clients.set(channelCd.toUpperCase(), client);
  }

  get(channelCd: string): OrderStatusClient {
    const client = this.clients.get(channelCd.toUpperCase());
    if (!client) {
      throw new Error(`ORDER_STATUS_SYNC is not supported for channelCd: ${channelCd}`);
    }
    return client;
  }
}

