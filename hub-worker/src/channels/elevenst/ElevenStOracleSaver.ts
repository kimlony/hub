import oracledb from "oracledb";
import { getOracleConnection } from "../../db/oracle.js";
import type { ElevenStOrder } from "./types.js";

type ElevenStPayload = {
  corpCd: string;
  channelCd: "11ST";
  channelAccountId: string;
  authType: "API_KEY";
  authInfo: {
    apiKey: string;
  };
  frDt: string;
  toDt: string;
};

export class ElevenStOracleSaver {
  static async saveAll(orders: ElevenStOrder[], payload: ElevenStPayload): Promise<void> {
    const connection = await getOracleConnection();

    try {
      for (const order of orders) {
        await saveOrder(connection, order, payload);
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

async function saveOrder(
  connection: oracledb.Connection,
  order: ElevenStOrder,
  payload: ElevenStPayload
): Promise<void> {
  const rawOrderId = createId("ORD");
  const orderId = createId("ORD");

  await connection.execute(
    `
      INSERT INTO BHUB_ORDER_RAW (
        RAW_ORDER_ID, CORP_CD, CHANNEL_CD, CHANNEL_ACCOUNT_ID,
        CHANNEL_ORDER_ID, ORDER_STATUS, ORDER_STATUS_CD,
        BUYER_NM, RECEIVE_NAME, RAW_DATA_JSON,
        ERP_IF_YN, PROC_ERR_YN, CONFIRM_YN,
        INSERT_DATETIME, INSERT_USER_ID
      ) VALUES (
        :rawOrderId, :corpCd, :channelCd, :channelAccountId,
        :channelOrderId, :orderStatus, :orderStatusCd,
        :buyerNm, :receiveName, :rawDataJson,
        '0', '0', '0',
        SYSDATE, 'HUB_WORKER'
      )
    `,
    {
      rawOrderId,
      corpCd: payload.corpCd,
      channelCd: payload.channelCd,
      channelAccountId: payload.channelAccountId,
      channelOrderId: order.ordNo,
      orderStatus: order.ordStatNm,
      orderStatusCd: order.ordStatCd,
      buyerNm: order.buyerNm,
      receiveName: order.rcvrNm,
      rawDataJson: JSON.stringify(order)
    }
  );

  const duplicateResult = await connection.execute<{ CNT: number }>(
    `
      SELECT COUNT(*) AS CNT
      FROM BHUB_ORDER
      WHERE CHANNEL_ORDER_ID = :channelOrderId
        AND CORP_CD = :corpCd
    `,
    {
      channelOrderId: order.ordNo,
      corpCd: payload.corpCd
    },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const duplicateCount = duplicateResult.rows?.[0]?.CNT ?? 0;
  if (duplicateCount > 0) {
    return;
  }

  await connection.execute(
    `
      INSERT INTO BHUB_ORDER (
        ORDER_ID, CORP_CD, CHANNEL_CD, CHANNEL_ACCOUNT_ID,
        CHANNEL_ORDER_ID, ORDER_DT, PAY_DT, ORDER_STATUS_CD,
        ORDER_AMT, PAY_AMT, BUYER_NM, BUYER_TEL,
        RECEIVER_NM, RECEIVER_TEL, RECEIVER_ADDR1, RECEIVER_ADDR2,
        DELV_MSG, ERP_IF_YN, USE_YN,
        INSERT_DATETIME, INSERT_USER_ID
      ) VALUES (
        :orderId, :corpCd, :channelCd, :channelAccountId,
        :channelOrderId, :orderDt, :payDt, :orderStatusCd,
        :orderAmt, :payAmt, :buyerNm, :buyerTel,
        :receiverNm, :receiverTel, :receiverAddr1, :receiverAddr2,
        :delvMsg, '0', '1',
        SYSDATE, 'HUB_WORKER'
      )
    `,
    {
      orderId,
      corpCd: payload.corpCd,
      channelCd: payload.channelCd,
      channelAccountId: payload.channelAccountId,
      channelOrderId: order.ordNo,
      orderDt: order.ordDt,
      payDt: order.payDt,
      orderStatusCd: order.ordStatCd,
      orderAmt: order.ordAmt,
      payAmt: order.payAmt,
      buyerNm: order.buyerNm,
      buyerTel: order.buyerTel,
      receiverNm: order.rcvrNm,
      receiverTel: order.rcvrTel,
      receiverAddr1: order.rcvrAddr1,
      receiverAddr2: order.rcvrAddr2,
      delvMsg: order.dlvMsg
    }
  );

  for (const [index, item] of order.items.entries()) {
    await connection.execute(
      `
        INSERT INTO BHUB_ORDER_ITEM (
          ORDER_PRODUCT_ID, CORP_CD, ORDER_ID,
          ORDER_LINE_NO, CHANNEL_ORDER_ID, CHANNEL_ORDER_SEQ,
          PRODUCT_CD, PRODUCT_NM, OPTION_NM,
          ORDER_QTY, ORDER_PRC, ORDER_AMT,
          DELV_COST, STATUS_CD, ITEM_MAP_YN, PROC_ERR_YN,
          INSERT_DATETIME, INSERT_USER_ID
        ) VALUES (
          :orderProductId, :corpCd, :orderId,
          :orderLineNo, :channelOrderId, :channelOrderSeq,
          :productCd, :productNm, :optionNm,
          :orderQty, :orderPrc, :orderAmt,
          :delvCost, :statusCd, '0', '0',
          SYSDATE, 'HUB_WORKER'
        )
      `,
      {
        orderProductId: createId("ORD"),
        corpCd: payload.corpCd,
        orderId,
        orderLineNo: index + 1,
        channelOrderId: order.ordNo,
        channelOrderSeq: item.ordSeq,
        productCd: item.prdNo,
        productNm: item.prdNm,
        optionNm: item.optNm,
        orderQty: item.ordQty,
        orderPrc: item.ordPrc,
        orderAmt: item.ordAmt,
        delvCost: item.dlvCost,
        statusCd: item.statCd
      }
    );
  }
}

function createId(prefix: string): string {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}
