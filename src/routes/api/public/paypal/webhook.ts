import { createFileRoute } from "@tanstack/react-router";

// PayPal webhook: verified via PayPal's verify-webhook-signature, then idempotently reconciles payment rows.
export const Route = createFileRoute("/api/public/paypal/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const webhookId = process.env["PAYPAL_WEBHOOK_ID"];
        if (!webhookId) return new Response("Webhook not configured", { status: 501 });
        const raw = await request.text();
        let event: any;
        try { event = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
        const h = request.headers;
        const { paypal } = await import("@/lib/paypal.server");
        try {
          const v = await paypal<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
            method: "POST",
            body: JSON.stringify({
              auth_algo: h.get("paypal-auth-algo"),
              cert_url: h.get("paypal-cert-url"),
              transmission_id: h.get("paypal-transmission-id"),
              transmission_sig: h.get("paypal-transmission-sig"),
              transmission_time: h.get("paypal-transmission-time"),
              webhook_id: webhookId,
              webhook_event: event,
            }),
          });
          if (v.verification_status !== "SUCCESS") return new Response("Invalid signature", { status: 400 });
        } catch {
          return new Response("Verification failed", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const r = event.resource ?? {};
        const orderId = r.supplementary_data?.related_ids?.order_id;
        if (orderId && event.event_type?.startsWith("PAYMENT.CAPTURE.")) {
          const status = event.event_type === "PAYMENT.CAPTURE.COMPLETED" ? "completed" : event.event_type === "PAYMENT.CAPTURE.PENDING" ? "approved" : "failed";
          const { data: pay } = await supabaseAdmin.from("payments").select("*").eq("paypal_order_id", orderId).maybeSingle();
          if (pay && pay.status !== "completed") {
            const amountOk = Number(r.amount?.value) === Number(pay.amount) && r.amount?.currency_code === pay.currency;
            const finalStatus = status === "completed" && !amountOk ? "failed" : status;
            await supabaseAdmin.from("payments").update({ status: finalStatus, paypal_capture_id: r.id, updated_at: new Date().toISOString() }).eq("id", pay.id);
            if (finalStatus === "completed") await supabaseAdmin.from("milestones").update({ status: "paid" }).eq("id", pay.milestone_id);
          }
        }
        return new Response("ok");
      },
    },
  },
});
