import oracledb from "oracledb";
import { getOracleConnection } from "../../db/oracle.js";
import { logger } from "../../logger.js";

type GchanPayload = {
  corpCd: string;
  channelCd: string;
  channelAccountId: string;
  frDt: string;
  toDt: string;
};

export class GchanOracleSaver {
  static async saveAll(
    orders: Record<string, unknown>[],
    payload: GchanPayload
  ): Promise<void> {
    const connection = await getOracleConnection();
    let savedCount = 0;
    let skippedCount = 0;

    try {
      for (const order of orders) {
        const saved = await saveRawOrder(connection, order, payload);
        if (saved) {
          savedCount += 1;
        } else {
          skippedCount += 1;
        }
      }

      logger.info({
        event: "ORACLE_SAVE_COMPLETED",
        channelCd: payload.channelCd,
        channelAccountId: payload.channelAccountId,
        savedCount,
        skippedCount
      }, "GCHAN Oracle save completed");
    } finally {
      await connection.close();
    }
  }
}

async function saveRawOrder(
  connection: oracledb.Connection,
  item: Record<string, unknown>,
  payload: GchanPayload
): Promise<boolean> {
  const recipientId = requireValue(item.recipientId, "recipientId");
  const orderCode = requireValue(item.orderCode, "orderCode");

  const duplicateResult = await connection.execute<{ CNT: number }>(
    `
      SELECT COUNT(*) AS CNT
      FROM BHUB_ORDER_RAW
      WHERE CORP_CD = :corpCd
        AND CHANNEL_ORDER_ID = :orderCode
        AND RAW_KEY = :recipientId
    `,
    {
      corpCd: payload.corpCd,
      orderCode,
      recipientId
    },
    {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    }
  );

  const duplicateCount = duplicateResult.rows?.[0]?.CNT ?? 0;
  if (duplicateCount > 0) {
    logger.info({
      event: "ORACLE_SAVE_DUPLICATE_SKIPPED",
      channelCd: payload.channelCd,
      channelAccountId: payload.channelAccountId,
      orderCode,
      recipientId
    }, "GCHAN Oracle duplicate skipped");
    return false;
  }

  await connection.execute(
    `
      INSERT INTO BHUB_ORDER_RAW (
        CORP_CD,
        RAW_ORDER_ID,
        BATCH_ID,
        RAW_KEY,
        ORDER_SEQ,
        CHANNEL_CD,
        CHANNEL_ACCOUNT_ID,
        CHANNEL_ORDER_ID,
        CHANNEL_ORDER_SEQ,
        ORDER_STATUS,
        ORDER_STATUS_CD,
        BUYER_NM,
        RECEIVE_NAME,
        PRODUCT_ID,
        ITEM_ID,
        ITEM_NAME,
        SALE_CNT,
        RAW_DATA_JSON,
        ERP_IF_YN,
        PROC_ERR_YN,
        CONFIRM_YN,
        INSERT_DATETIME,
        INSERT_USER_ID,
        UPDATE_DATETIME,
        UPDATE_USER_ID
      ) VALUES (
        :corpCd,
        :rawOrderId,
        NULL,
        :rawKey,
        1,
        :channelCd,
        :channelAccountId,
        :channelOrderId,
        :channelOrderSeq,
        :orderStatus,
        NULL,
        :buyerNm,
        :receiveName,
        :productId,
        NULL,
        :itemName,
        :saleCnt,
        :rawDataJson,
        '0',
        '0',
        '0',
        SYSDATE,
        'HUB_WORKER',
        NULL,
        NULL
      )
    `,
    {
      corpCd: payload.corpCd,
      rawOrderId: createId("ORD"),
      rawKey: recipientId,
      channelCd: payload.channelCd,
      channelAccountId: payload.channelAccountId,
      channelOrderId: orderCode,
      channelOrderSeq: recipientId,
      orderStatus: toNullableString(item.receivedStatus),
      buyerNm: toNullableString(item.senderFullName),
      receiveName: toNullableString(item.recipientName),
      productId: toNullableString(item.itemId),
      itemName: toNullableString(item.productName),
      saleCnt: toNullableNumber(item.quantity),
      rawDataJson: {
        val: JSON.stringify(item),
        type: oracledb.CLOB
      }
    },
    {
      autoCommit: true
    }
  );

  return true;
}

function requireValue(value: unknown, fieldName: string): string {
  const normalized = toNullableString(value);
  if (!normalized) {
    throw new Error(`GCHAN Oracle ${fieldName} is required`);
  }

  return normalized;
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value);
  return normalized === "" ? null : normalized;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function createId(prefix: string): string {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}
