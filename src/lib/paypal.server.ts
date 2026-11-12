const GATEWAY_URL = "https://connector-gateway.lovable.dev/paypal";

export class PayPalError extends Error {
  constructor(public status: number, public body: any, text: string) {
    super(`PayPal request failed [${status}]: ${text.slice(0, 300)}`);
  }
  get issues(): string[] {
    return (this.body?.details ?? []).map((d: any) => d?.issue).filter(Boolean);
  }
}

export async function paypal<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  const PAYPAL_API_KEY = process.env["PAYPAL_API_KEY"];
  if (!LOVABLE_API_KEY || !PAYPAL_API_KEY) throw new Error("PayPal is not configured.");
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": PAYPAL_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let info: any = {};
    try { info = JSON.parse(text); } catch {}
    console.error("PayPal API error", JSON.stringify({
      status: res.status,
      path,
      name: info?.name,
      issues: (info?.details ?? []).map((d: any) => d?.issue),
      description: info?.details?.[0]?.description ?? info?.message,
      debug_id: info?.debug_id,
    }));
    throw new PayPalError(res.status, info, text);
  }
  return (text ? JSON.parse(text) : {}) as T;
}
