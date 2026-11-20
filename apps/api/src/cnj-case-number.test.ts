import { describe, expect, it } from "vitest";
import { CourtCaseCreateSchema, CourtCaseUpdateSchema, isValidCnjCaseNumber } from "../../../packages/contracts/src/index";

// Year 9999 makes these numbers visibly synthetic.
const validNumber = "0000000-04.9999.8.16.0001";
const oldCheckDigits = "0000000-07.9999.8.16.0001";

describe("CNJ case number check digits", () => {
  it("accepts the CNJ modulo 97 result and rejects the old calculation", () => {
    expect(isValidCnjCaseNumber(validNumber)).toBe(true);
    expect(isValidCnjCaseNumber(oldCheckDigits)).toBe(false);
  });

  it("normalizes valid digits on creation and rejects invalid digits on update", () => {
    const created = CourtCaseCreateSchema.parse({
      courtName: "Tribunal de exemplo",
      caseNumber: validNumber.replace(/\D/g, ""),
    });
    expect(created.caseNumber).toBe(validNumber);
    const updated = CourtCaseUpdateSchema.safeParse({
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      caseNumber: oldCheckDigits,
    });
    expect(updated.success).toBe(false);
    if (!updated.success) {
      expect(updated.error.issues).toContainEqual(expect.objectContaining({
        path: ["caseNumber"],
        message: "invalid_cnj_check_digits",
      }));
    }
  });
});
