export type JobHandlerMessage = {
  requestId: string;
  sourceErp: string;
  jobType: string;
  requestKey: string;
  parentJobId?: string | null;
  correlationId?: string;
  causationId?: string | null;
  schemaVersion?: string;
  payloadVersion?: string;
  payload: Record<string, unknown>;
};

export interface IJobHandler {
  handle(message: JobHandlerMessage): Promise<void>;
}
