import type { JobHandlerMessage } from "./IJobHandler.js";

export type CollectResult = {
  requestId: string;
  channelCd: string;
  totalCount: number;
  orders: unknown[];
};

export interface ICollectHandler {
  handle(message: JobHandlerMessage): Promise<CollectResult>;
}
