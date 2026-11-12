import { describe, expect, it } from "vitest";
import { evaluateOrder, refundAmountFor } from "@/lib/payment-rules";

const exp = { paymentId: "p1", milestoneId: "m1", amount: 60, currency: "USD", orderId: "O1" };
const order = (status: string, cap?: any, amt = { value: "60.00", currency_code: "USD" }) => ({
  id: "O1", status, purchase_units: [{ reference_id: "m1", amount: amt, payments: cap ? { captures: [cap] } : undefined }],
});

describe("payment verification", () => {
  it("marks completed only when order and capture are COMPLETED with matching amount", () => {
    const r = evaluateOrder(order("COMPLETED", { id: "C1", status: "COMPLETED", amount: { value: "60.00", currency_code: "USD" } }), exp);
    expect(r).toMatchObject({ status: "completed", captureId: "C1" });
  });
  it("buyer approval alone is not paid", () => {
    expect(evaluateOrder(order("APPROVED"), exp).status).toBe("approved");
  });
  it("pending capture stays pending", () => {
    expect(evaluateOrder(order("COMPLETED", { id: "C1", status: "PENDING", amount: { value: "60.00", currency_code: "USD" } }), exp).status).toBe("pending");
  });
  it("amount mismatch fails", () => {
    expect(evaluateOrder(order("COMPLETED", { id: "C1", status: "COMPLETED", amount: { value: "0.01", currency_code: "USD" } }), exp).status).toBe("failed");
  });
  it("currency mismatch fails", () => {
    expect(evaluateOrder(order("COMPLETED", { id: "C1", status: "COMPLETED", amount: { value: "60.00", currency_code: "EUR" } }), exp).status).toBe("failed");
  });
  it("order for another milestone fails", () => {
    const o = order("COMPLETED", { id: "C1", status: "COMPLETED", amount: { value: "60.00", currency_code: "USD" } });
    o.purchase_units[0].reference_id = "other";
    expect(evaluateOrder(o, exp).status).toBe("failed");
  });
  it("declined capture fails and voided order is cancelled", () => {
    expect(evaluateOrder(order("COMPLETED", { id: "C1", status: "DECLINED", amount: { value: "60.00", currency_code: "USD" } }), exp).status).toBe("failed");
    expect(evaluateOrder(order("VOIDED"), exp).status).toBe("cancelled");
  });
});

describe("refund amounts", () => {
  it("full refund returns the remaining amount", () => expect(refundAmountFor("full_refund", 200, 50)).toBe(150));
  it("partial refund must be below the remaining amount", () => {
    expect(refundAmountFor("partial_refund", 200, 0, 80)).toBe(80);
    expect(() => refundAmountFor("partial_refund", 200, 0, 200)).toThrow();
    expect(() => refundAmountFor("partial_refund", 200, 0, 0)).toThrow();
  });
  it("nothing left to refund", () => expect(() => refundAmountFor("full_refund", 200, 200)).toThrow());
});
