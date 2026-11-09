export const money = (n: number | string | null | undefined, cur = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD" }).format(Number(n ?? 0));

export const date = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

export const statusLabel = (s: string) => s.replace(/_/g, " ");
