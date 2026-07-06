import { z } from "zod";

export const HubJobPayloadSchema = z.object({
  mallKey: z.string().optional(),
  channelCd: z.string(),
  userId: z.union([z.string(), z.number()]).optional()
}).passthrough();

export type HubJobPayload = z.infer<typeof HubJobPayloadSchema>;

export const HubJobMessageSchema = z.object({
  requestId: z.string(),
  sourceErp: z.string(),
  jobType: z.string().min(1),
  requestKey: z.string(),
  parentJobId: z.string().nullable().optional(),
  correlationId: z.string().optional(),
  causationId: z.string().nullable().optional(),
  schemaVersion: z.string().optional(),
  payloadVersion: z.string().optional(),
  payload: HubJobPayloadSchema
}).superRefine((message, ctx) => {
  if ((message.jobType === "ORDER_COLLECT" || message.jobType === "ORDER_STATUS_SYNC")
      && !message.payload.mallKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payload", "mallKey"],
      message: `mallKey is required for ${message.jobType}`
    });
  }

  if ((message.jobType === "ORDER_COLLECT" || message.jobType === "ORDER_STATUS_SYNC")
      && message.payload.userId === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payload", "userId"],
      message: `userId is required for ${message.jobType}`
    });
  }

  if (message.jobType === "ORDER_STATUS_SYNC") {
    for (const field of ["corpId", "channelAccountId", "frDt", "toDt", "syncMode"] as const) {
      if (message.payload[field] === undefined || message.payload[field] === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["payload", field],
          message: `${field} is required for ORDER_STATUS_SYNC`
        });
      }
    }
    if (!Array.isArray(message.payload.statusTypes) || message.payload.statusTypes.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", "statusTypes"],
        message: "statusTypes is required for ORDER_STATUS_SYNC"
      });
    }
  }
});
export type HubJobMessageInput = z.infer<typeof HubJobMessageSchema>;

export const CollectRequestPayloadSchema = z.object({
  mallKey: z.string(),
  channelCd: z.string(),
  userId: z.union([z.string(), z.number()])
}).passthrough();

export const CollectRequestSchema = z.object({
  requestId: z.string(),
  payload: CollectRequestPayloadSchema
}).passthrough();

export type CollectRequest = z.infer<typeof CollectRequestSchema>;
