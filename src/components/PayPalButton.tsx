import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createPayPalOrder, capturePayPalOrder } from "@/lib/pacepay.functions";

declare global {
  interface Window { paypal?: any }
}

function loadSdk(currency: string) {
  const clientId = import.meta.env["VITE_LOVABLE_CONNECTOR_PAYPAL_CLIENT_ID"];
  if (!clientId) return Promise.reject(new Error("PayPal client ID is not configured"));
  const src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}&intent=capture`;
  const existing = document.querySelector<HTMLScriptElement>(`script[data-pp="${currency}"]`);
  if (existing && window.paypal) return Promise.resolve();
  return new Promise<void>((res, rej) => {
    const s = existing ?? document.createElement("script");
    s.src = src;
    s.dataset["pp"] = currency;
    s.onload = () => res();
    s.onerror = () => rej(new Error("Failed to load PayPal"));
    if (!existing) document.body.appendChild(s);
  });
}

export function PayPalButton({ milestoneId, currency, onDone }: { milestoneId: string; currency: string; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const createOrder = useServerFn(createPayPalOrder);
  const capture = useServerFn(capturePayPalOrder);
  const [state, setState] = useState<"loading" | "ready" | "processing" | "error">("loading");
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadSdk(currency)
      .then(() => {
        if (cancelled || !ref.current || !window.paypal) return;
        ref.current.innerHTML = "";
        window.paypal
          .Buttons({
            style: { layout: "vertical", color: "gold", shape: "rect", label: "pay" },
            createOrder: async () => (await createOrder({ data: { milestoneId } })).orderId,
            onApprove: async (d: { orderID: string }) => {
              setState("processing");
              try {
                const r = await capture({ data: { milestoneId, orderId: d.orderID } });
                if (r.status === "completed") toast.success(`Payment captured (${r.captureId})`);
                else toast.warning(`Payment status: ${r.status}`);
              } catch (e: any) {
                toast.error(e.message);
              }
              onDone();
            },
            onCancel: () => toast.info("Payment cancelled"),
            onError: (e: any) => { setErr(String(e?.message ?? e)); setState("error"); },
          })
          .render(ref.current);
        setState("ready");
      })
      .catch((e) => { setErr(e.message); setState("error"); });
    return () => { cancelled = true; };
  }, [milestoneId, currency]);

  return (
    <div>
      {state === "loading" && <p className="text-sm text-muted-foreground">Loading PayPal…</p>}
      {state === "processing" && <p className="text-sm text-warning">Confirming payment with PayPal…</p>}
      {state === "error" && <p className="text-sm text-destructive">{err}</p>}
      <div ref={ref} className="max-w-sm rounded-lg bg-foreground p-3" style={{ display: state === "processing" ? "none" : undefined }} />
    </div>
  );
}
