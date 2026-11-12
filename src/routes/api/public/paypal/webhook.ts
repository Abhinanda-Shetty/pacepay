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
        // Signature verified. Never trust the event body for status: re-read the order from PayPal and reconcile.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const r = event.resource ?? {};
        const type: string = event.event_type ?? "";
        let pay: any = null;
        if (type.startsWith("PAYMENT.CAPTURE.") || type.startsWith("CHECKOUT.ORDER.")) {
          const orderId = type.startsWith("CHECKOUT.ORDER.") ? r.id : r.supplementary_data?.related_ids?.order_id;
          const upHref: string | undefined = (r.links ?? []).find((l: any) => l.rel === "up")?.href;
          const captureId = type === "PAYMENT.CAPTURE.REFUNDED" || type === "PAYMENT.CAPTURE.REVERSED" ? upHref?.split("/").pop() : r.id;
          if (orderId) pay = (await supabaseAdmin.from("payments").select("*").eq("paypal_order_id", orderId).maybeSingle()).data;
          if (!pay && captureId) pay = (await supabaseAdmin.from("payments").select("*").eq("paypal_capture_id", captureId).maybeSingle()).data;
        }
        if (pay) {
          const { syncPayment } = await import("@/lib/payments.server");
          try { await syncPayment(pay); } catch (e) { console.error("Webhook reconcile failed", String(e)); return new Response("Retry", { status: 500 }); }
        }
        return new Response("ok");
      },
    },
  },
});
