export type ElevenStOrderItem = {
  ordSeq: string;
  prdNo: string;
  prdNm: string;
  optNm: string;
  ordQty: number;
  ordPrc: number;
  ordAmt: number;
  dlvCost: number;
  statCd: string;
};

export type ElevenStOrder = {
  ordNo: string;
  ordDt: string;
  payDt: string;
  ordStatCd: string;
  ordStatNm: string;
  buyerNm: string;
  buyerTel: string;
  rcvrNm: string;
  rcvrTel: string;
  rcvrAddr1: string;
  rcvrAddr2: string;
  dlvMsg: string;
  ordAmt: number;
  payAmt: number;
  items: ElevenStOrderItem[];
};
