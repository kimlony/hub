import type { IJobHandler } from "./IJobHandler.js";

export class HandlerRegistry {
  private readonly handlers = new Map<string, IJobHandler>();

  register(jobType: string, handler: IJobHandler, channelCd?: string): void {
    this.handlers.set(this.toKey(jobType, channelCd), handler);
  }

  get(jobType: string, channelCd?: string): IJobHandler {
    const handler = this.handlers.get(this.toKey(jobType, channelCd)) ?? this.handlers.get(this.toKey(jobType));

    if (!handler) {
      throw new Error(`Unsupported jobType/channelCd: ${jobType}/${channelCd ?? "-"}`);
    }

    return handler;
  }

  private toKey(jobType: string, channelCd?: string): string {
    return channelCd ? `${jobType}:${channelCd}` : jobType;
  }
}
