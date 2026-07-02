import type { ErpConnection, ErpConnectionRepository } from "./ErpConnectionRepository.js";

export interface ErpTokenProvider {
  getAccessToken(connection: ErpConnection): Promise<string>;
  forceRefreshToken(connection: ErpConnection): Promise<string>;
}

export class MockErpTokenProvider implements ErpTokenProvider {
  constructor(
    private readonly repository: ErpConnectionRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getAccessToken(connection: ErpConnection): Promise<string> {
    const now = this.now();
    if (connection.accessToken && connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > now.getTime()) {
      return connection.accessToken;
    }
    return this.issueToken(connection, now);
  }

  forceRefreshToken(connection: ErpConnection): Promise<string> {
    return this.issueToken(connection, this.now());
  }

  private async issueToken(connection: ErpConnection, now: Date): Promise<string> {
    let issuedAt = now.getTime();
    let token = `MOCK-TOKEN-${connection.erpConnectionId}-${issuedAt}`;
    if (token === connection.accessToken) {
      issuedAt += 1;
      token = `MOCK-TOKEN-${connection.erpConnectionId}-${issuedAt}`;
    }
    const expiresAt = new Date(issuedAt + 30 * 60 * 1000);
    await this.repository.saveToken(connection.erpConnectionId, token, expiresAt);
    connection.accessToken = token;
    connection.tokenExpiresAt = expiresAt;
    return token;
  }
}
