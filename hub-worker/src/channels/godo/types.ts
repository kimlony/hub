export type GodoOrder = Record<string, unknown>;

export type GodoFetchOrdersResult = {
  rawXml: string;
  code: string;
  message: string;
  lastOrder: boolean;
  orders: GodoOrder[];
};
