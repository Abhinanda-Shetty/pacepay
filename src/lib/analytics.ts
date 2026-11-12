export type AnalyticsPayment = {
  amount: number | string;
  refunded_amount: number | string | null;
  currency: string | null;
  status: string;
  payer_id: string;
  payee_id: string | null;
};

export const SETTLED = ["completed", "partially_refunded", "refunded"];
export const IN_FLIGHT = ["created", "pending"];
export const UNSUCCESSFUL = ["failed", "cancelled"];

export type Totals = Record<string, number>;

const add = (t: Totals, cur: string | null, n: number) => {
  const k = cur || "USD";
  t[k] = Math.round(((t[k] ?? 0) + n) * 100) / 100;
};

/** Money totals are grouped per currency so mixed currencies are never summed together. */
export function summarize(rows: AnalyticsPayment[], userId: string, role: string | null) {
  const net: Totals = {};
  const refunded: Totals = {};
  let inFlight = 0;
  let unsuccessful = 0;
  let settled = 0;
  for (const p of rows) {
    const mine = role === "admin" || (role === "freelancer" ? p.payee_id === userId : p.payer_id === userId);
    if (!mine) continue;
    const amount = Number(p.amount) || 0;
    const ref = Math.min(amount, Math.max(0, Number(p.refunded_amount) || 0));
    if (SETTLED.includes(p.status)) {
      settled++;
      add(net, p.currency, amount - ref);
      if (ref > 0) add(refunded, p.currency, ref);
    } else if (IN_FLIGHT.includes(p.status)) inFlight++;
    else if (UNSUCCESSFUL.includes(p.status)) unsuccessful++;
  }
  return { net, refunded, inFlight, unsuccessful, settled };
}
