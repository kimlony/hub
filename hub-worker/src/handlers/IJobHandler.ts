export type JobHandlerMessage = {
  requestId: string;
  sourceErp: string;
  jobType: string;
  requestKey: string;
  payload: Record<string, unknown>;
};

export interface IJobHandler {
  handle(message: JobHandlerMessage): Promise<void>;
}
