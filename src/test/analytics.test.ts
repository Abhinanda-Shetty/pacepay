import { describe, it, expect } from "vitest";
import { summarize } from "@/lib/analytics";

const p = (o: any) => ({ amount: 100, refunded_amount: 0, currency: "USD", status: "completed", payer_id: "c", payee_id: "f", ...o });

describe("analytics summarize", () => {
  it("new account with no payments is all zero", () => {
    expect(summarize([], "f", "freelancer")).toEqual({ net: {}, refunded: {}, inFlight: 0, unsuccessful: 0, settled: 0 });
  });
  it("freelancer earns net of refunds only on their own settled payments", () => {
    const s = summarize([p({ refunded_amount: 30, status: "partially_refunded" }), p({ payee_id: "x" }), p({ status: "failed" })], "f", "freelancer");
    expect(s.net).toEqual({ USD: 70 });
    expect(s.refunded).toEqual({ USD: 30 });
    expect(s.unsuccessful).toBe(1);
  });
  it("pending orders are not counted as money", () => {
    const s = summarize([p({ status: "pending" })], "c", "client");
    expect(s.net).toEqual({});
    expect(s.inFlight).toBe(1);
  });
  it("different currencies are never added together", () => {
    expect(summarize([p({}), p({ currency: "EUR", amount: 50 })], "c", "client").net).toEqual({ USD: 100, EUR: 50 });
  });
});
