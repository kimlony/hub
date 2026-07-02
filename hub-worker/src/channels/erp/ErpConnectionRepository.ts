import {
  findErpConnection,
  updateErpConnectionToken,
  type ErpConnection
} from "../../db/postgres.js";

export type { ErpConnection };

export interface ErpConnectionRepository {
  findById(corpId: number, erpConnectionId: string): Promise<ErpConnection | null>;
  saveToken(erpConnectionId: string, accessToken: string, expiresAt: Date): Promise<void>;
}

export class PostgresErpConnectionRepository implements ErpConnectionRepository {
  findById(corpId: number, erpConnectionId: string): Promise<ErpConnection | null> {
    return findErpConnection(corpId, erpConnectionId);
  }

  saveToken(erpConnectionId: string, accessToken: string, expiresAt: Date): Promise<void> {
    return updateErpConnectionToken(erpConnectionId, accessToken, expiresAt);
  }
}
