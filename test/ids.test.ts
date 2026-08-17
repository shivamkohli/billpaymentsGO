import {
  generateAgentId,
  generateComplaintId,
  generateEntityId,
  generateMsgOrRefId,
  generateTxnReferenceId,
  isoTimestamp,
  julianDateYDDD,
  julianDateYYDDD,
} from "../src/ids/generator";

describe("BBPS ID generation (NPCI spec v14.0 Section 20)", () => {
  it("julianDateYDDD is 4 chars: 1-digit year + 3-digit day-of-year", () => {
    const d = new Date(2026, 7, 11); // 2026-08-11
    expect(julianDateYDDD(d)).toHaveLength(4);
    expect(julianDateYDDD(d).startsWith("6")).toBe(true);
  });

  it("julianDateYYDDD is 5 chars: 2-digit year + 3-digit day-of-year", () => {
    const d = new Date(2026, 7, 11);
    expect(julianDateYYDDD(d)).toHaveLength(5);
    expect(julianDateYYDDD(d).startsWith("26")).toBe(true);
  });

  it("generateMsgOrRefId is fixed length 35", () => {
    expect(generateMsgOrRefId()).toHaveLength(35);
  });

  it("generateTxnReferenceId is length 12 or 20 depending on variant", () => {
    expect(generateTxnReferenceId("RZPY", 12)).toHaveLength(12);
    expect(generateTxnReferenceId("RZPY", 20)).toHaveLength(20);
  });

  it("generateTxnReferenceId rejects a non-4-char institution id", () => {
    expect(() => generateTxnReferenceId("RZ")).toThrow();
  });

  it("generateComplaintId is fixed length 15", () => {
    expect(generateComplaintId("RZPY6224HRVZ1CK6TRM")).toHaveLength(15);
  });

  it("generateAgentId is fixed length 20 and validates input lengths", () => {
    expect(generateAgentId("RZPY", "RZPY", "INT")).toHaveLength(20);
    expect(() => generateAgentId("RZ", "RZPY", "INT")).toThrow();
    expect(() => generateAgentId("RZPY", "RZPY", "IN")).toThrow();
  });

  it("isoTimestamp is fixed length 25", () => {
    expect(isoTimestamp()).toHaveLength(25);
  });

  it("generateEntityId produces a prefixed merchant-facing id", () => {
    const id = generateEntityId("billreq");
    expect(id.startsWith("billreq_")).toBe(true);
    expect(generateEntityId("billreq")).not.toBe(id); // random per call
  });
});
