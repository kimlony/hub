import type { ICollectHandler } from "./ICollectHandler.js";

export class CollectHandlerRegistry {
  private readonly handlers = new Map<string, ICollectHandler>();

  register(channelCd: string, handler: ICollectHandler): void {
    this.handlers.set(channelCd, handler);
  }

  get(channelCd: string): ICollectHandler | undefined {
    return this.handlers.get(channelCd);
  }
}
