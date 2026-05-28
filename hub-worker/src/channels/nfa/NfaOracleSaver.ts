/*
import oracledb from "oracledb";
import { getOracleConnection } from "../../db/oracle.js";

type NfaPayload = {
  corpCd: string;
  channelCd: "NFA";
  channelAccountId: string;
  authType: "ID_PW";
  authInfo: {
    clientId: string;
    clientSecret: string;
    sellerId: string;
  };
  frDt: string;
  toDt: string;
};

export class NfaOracleSaver {
  static async saveAll(
    rawOrders: Record<string, unknown>[],
    payload: NfaPayload
  ): Promise<void> {
    const connection = await getOracleConnection();

    try {
      for (const rawOrder of rawOrders) {
        await saveRawOrder(connection, rawOrder, payload);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.close();
    }
  }
}

async function saveRawOrder(
  connection: oracledb.Connection,
  rawOrder: Record<string, unknown>,
  payload: NfaPayload
): Promise<void> {
  await connection.execute(
    `
      INSERT INTO BHUB_ORDER_RAW (
        RAW_ORDER_ID, CORP_CD, CHANNEL_CD, CHANNEL_ACCOUNT_ID,
        CHANNEL_ORDER_ID, RAW_DATA_JSON,
        ERP_IF_YN, PROC_ERR_YN, CONFIRM_YN,
        INSERT_DATETIME, INSERT_USER_ID
      ) VALUES (
        :rawOrderId, :corpCd, :channelCd, :channelAccountId,
        :channelOrderId, :rawDataJson,
        '0', '0', '0',
        SYSDATE, 'HUB_WORKER'
      )
    `,
    {
      rawOrderId: createId("ORD"),
      corpCd: payload.corpCd,
      channelCd: payload.channelCd,
      channelAccountId: payload.channelAccountId,
      channelOrderId: resolveChannelOrderId(rawOrder),
      rawDataJson: JSON.stringify(rawOrder)
    }
  );
}

function resolveChannelOrderId(rawOrder: Record<string, unknown>): string {
  const productOrder = toRecord(rawOrder.productOrder);
  const order = toRecord(rawOrder.order);
  return String(productOrder.productOrderId ?? order.orderId ?? createId("NFA"));
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function createId(prefix: string): string {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}
*/
