const GATEWAY_URL = "https://connector-gateway.lovable.dev/paypal";

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
    console.error(`PayPal ${res.status}: ${text}`);
    throw new Error(`PayPal request failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}
