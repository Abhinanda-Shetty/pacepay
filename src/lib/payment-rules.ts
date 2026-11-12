// Pure rules for interpreting PayPal results. No I/O so they can be unit-tested.
export type PayStatus = "created" | "approved" | "pending" | "completed" | "failed" | "cancelled" | "refunded" | "partially_refunded";

export interface Expected { paymentId: string; milestoneId: string; amount: number; currency: string; orderId: string }

export function money2(n: number | string) { return Number(n).toFixed(2); }

/** Decide the payment status from a PayPal order (GET /v2/checkout/orders/{id} or capture response). */
export function evaluateOrder(order: any, exp: Expected): { status: PayStatus; captureId: string | null; detail: string } {
  if (!order || order.id !== exp.orderId) return { status: "failed", captureId: null, detail: "Order ID mismatch" };
  const pu = order.purchase_units?.[0];
  const cap = pu?.payments?.captures?.[0];
  const capId: string | null = cap?.id ?? null;
  if (pu?.reference_id && pu.reference_id !== exp.milestoneId) return { status: "failed", captureId: capId, detail: "Order belongs to another milestone" };
  const amt = cap?.amount ?? pu?.amount;
  if (!amt || money2(amt.value) !== money2(exp.amount) || amt.currency_code !== exp.currency)
    return { status: "failed", captureId: capId, detail: `Amount mismatch (got ${amt?.currency_code} ${amt?.value})` };
  switch (order.status) {
    case "CREATED": case "SAVED": case "PAYER_ACTION_REQUIRED": return { status: "created", captureId: null, detail: "Waiting for buyer approval" };
    case "APPROVED": return { status: "approved", captureId: null, detail: "Buyer approved, not yet captured" };
    case "VOIDED": return { status: "cancelled", captureId: null, detail: "Order voided" };
  }
  if (!cap) return { status: "failed", captureId: null, detail: `Unexpected order status ${order.status}` };
  return fromCaptureStatus(cap.status, capId, cap.status_details?.reason);
}

export function fromCaptureStatus(s: string, capId: string | null, reason?: string): { status: PayStatus; captureId: string | null; detail: string } {
  switch (s) {
    case "COMPLETED": return { status: "completed", captureId: capId, detail: "Captured" };
    case "PENDING": return { status: "pending", captureId: capId, detail: `Capture pending${reason ? `: ${reason}` : ""}` };
    case "REFUNDED": return { status: "refunded", captureId: capId, detail: "Fully refunded" };
    case "PARTIALLY_REFUNDED": return { status: "partially_refunded", captureId: capId, detail: "Partially refunded" };
    case "DECLINED": case "FAILED": return { status: "failed", captureId: capId, detail: `Capture ${s.toLowerCase()}` };
    default: return { status: "failed", captureId: capId, detail: `Unknown capture status ${s}` };
  }
}

/** Validate an admin refund amount against what is still refundable. */
export function refundAmountFor(outcome: "full_refund" | "partial_refund", paid: number, alreadyRefunded: number, requested?: number | null): number {
  const remaining = +(paid - alreadyRefunded).toFixed(2);
  if (remaining <= 0) throw new Error("Nothing left to refund");
  if (outcome === "full_refund") return remaining;
  const r = Number(requested);
  if (!(r > 0)) throw new Error("Partial refund must be greater than zero");
  if (+r.toFixed(2) >= remaining) throw new Error(`Partial refund must be less than ${remaining.toFixed(2)}; use a full refund instead`);
  return +r.toFixed(2);
}
