import { isGodoSuccessCode } from "./GodoApiClient.js";

describe("GODO success code parsing", () => {
  it('treats success code "000" as success', () => {
    expect(isGodoSuccessCode("000")).toBe(true);
  });

  it("treats numeric success code 0 as success", () => {
    expect(isGodoSuccessCode(0)).toBe(true);
  });

  it('treats failure code "993" as failure', () => {
    expect(isGodoSuccessCode("993")).toBe(false);
  });

  it("treats numeric failure code 993 as failure", () => {
    expect(isGodoSuccessCode(993)).toBe(false);
  });
});
