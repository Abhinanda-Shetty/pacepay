import { paypal } from "./paypal.server";
import { evaluateOrder, fromCaptureStatus } from "./payment-rules";

const FINAL = ["completed", "refunded", "partially_refunded"];

/** Re-read a payment from PayPal (authoritative) and apply the verified result. */
export async function syncPayment(pay: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!pay.paypal_order_id) return pay;
  const order = await paypal(`/v2/checkout/orders/${pay.paypal_order_id}`);
  let r = evaluateOrder(order, { paymentId: pay.id, milestoneId: pay.milestone_id, amount: Number(pay.amount), currency: pay.currency, orderId: pay.paypal_order_id });
  let refunded = Number(pay.refunded_amount ?? 0);
  if (r.captureId && ["completed", "refunded", "partially_refunded"].includes(r.status)) {
    const cap = await paypal(`/v2/payments/captures/${r.captureId}`);
    r = fromCaptureStatus(cap.status, r.captureId, cap.status_details?.reason);
    if (r.status === "refunded") refunded = Number(pay.amount);
    else if (r.status === "partially_refunded") {
      const { data: rows } = await supabaseAdmin.from("refunds").select("amount, status").eq("payment_id", pay.id);
      refunded = (rows ?? []).filter((x) => x.status === "COMPLETED").reduce((s, x) => s + Number(x.amount), 0);
    }
  }
  // never downgrade a payment that was already verified as captured, except to a refund state
  if (FINAL.includes(pay.status) && !FINAL.includes(r.status)) return pay;
  const { data: updated } = await supabaseAdmin
    .from("payments")
    .update({ status: r.status, paypal_capture_id: r.captureId ?? pay.paypal_capture_id, status_detail: r.detail, refunded_amount: refunded, raw: order, updated_at: new Date().toISOString() })
    .eq("id", pay.id)
    .select()
    .single();
  await applyMilestoneEffects(pay, r.status);
  return updated ?? pay;
}

async function applyMilestoneEffects(pay: any, status: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  if (status === "completed" || status === "partially_refunded") {
    const { data: changed } = await supabaseAdmin.from("milestones").update({ status: "paid", updated_at: now }).eq("id", pay.milestone_id).eq("status", "approved").select("title");
    if (changed?.length && pay.payee_id)
      await supabaseAdmin.from("notifications").insert({
        user_id: pay.payee_id, type: "payment",
        title: `Payment received: ${changed[0]!.title}`,
        message: `${pay.currency} ${Number(pay.amount).toFixed(2)} was paid via PayPal.`,
        link: `/milestones/${pay.milestone_id}`,
      });
  }
  if (status === "refunded") await supabaseAdmin.from("milestones").update({ status: "refunded", updated_at: now }).eq("id", pay.milestone_id).in("status", ["paid", "approved"]);
}
