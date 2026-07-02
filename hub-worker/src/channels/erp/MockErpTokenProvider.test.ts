import { jest } from "@jest/globals";
import type { ErpConnection, ErpConnectionRepository } from "./ErpConnectionRepository.js";
import { MockErpTokenProvider } from "./MockErpTokenProvider.js";

const now = new Date("2026-07-02T00:00:00.000Z");

function connection(overrides: Partial<ErpConnection> = {}): ErpConnection {
  return {
    id: 1, corpId: 100, erpConnectionId: "ERP-100", erpType: "MOCK",
    baseUrl: null, authType: "TOKEN", tokenUrl: null, clientId: null,
    clientSecret: null, accessToken: null, refreshToken: null,
    tokenExpiresAt: null, isActive: true, ...overrides
  };
}

function repository() {
  return {
    findById: jest.fn<ErpConnectionRepository["findById"]>(),
    saveToken: jest.fn<ErpConnectionRepository["saveToken"]>(async () => undefined)
  };
}

describe("MockErpTokenProvider", () => {
  it("issues and persists a token when one is missing", async () => {
    const repo = repository();
    const provider = new MockErpTokenProvider(repo, () => now);
    await expect(provider.getAccessToken(connection())).resolves.toBe("MOCK-TOKEN-ERP-100-1782950400000");
    expect(repo.saveToken).toHaveBeenCalledWith("ERP-100", expect.stringContaining("MOCK-TOKEN-ERP-100"),
      new Date("2026-07-02T00:30:00.000Z"));
  });

  it("reuses a non-expired token", async () => {
    const repo = repository();
    const provider = new MockErpTokenProvider(repo, () => now);
    await expect(provider.getAccessToken(connection({
      accessToken: "existing-token",
      tokenExpiresAt: new Date("2026-07-02T00:10:00.000Z")
    }))).resolves.toBe("existing-token");
    expect(repo.saveToken).not.toHaveBeenCalled();
  });

  it("force refresh always replaces the current token", async () => {
    const repo = repository();
    const provider = new MockErpTokenProvider(repo, () => now);
    const current = connection({ accessToken: "MOCK-TOKEN-ERP-100-1782950400000" });
    await expect(provider.forceRefreshToken(current)).resolves.toBe("MOCK-TOKEN-ERP-100-1782950400001");
    expect(repo.saveToken).toHaveBeenCalledTimes(1);
  });

  it("refreshes an expired token", async () => {
    const repo = repository();
    const provider = new MockErpTokenProvider(repo, () => now);
    await expect(provider.getAccessToken(connection({
      accessToken: "expired-token",
      tokenExpiresAt: new Date("2026-07-01T23:59:59.000Z")
    }))).resolves.toContain("MOCK-TOKEN-ERP-100");
    expect(repo.saveToken).toHaveBeenCalledTimes(1);
  });
});
