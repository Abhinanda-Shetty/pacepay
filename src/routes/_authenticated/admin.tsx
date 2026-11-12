import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { resolveDispute } from "@/lib/pacepay.functions";
import { money, date } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Disputes — PacePay admin" }, { name: "description", content: "Review and resolve milestone disputes and refunds." }, { property: "og:title", content: "Disputes — PacePay admin" }, { property: "og:description", content: "Admin dispute resolution." }] }),
  component: Admin,
});

function Admin() {
  const { data: me } = useMe();
  const { data = [] } = useQuery({
    queryKey: ["disputes-admin"],
    enabled: me?.role === "admin",
    queryFn: async () => {
      const { data: ds } = await supabase.from("disputes").select("*, milestones(id, title, status, amount, currency), projects(title, client_id, freelancer_id)").order("created_at", { ascending: false });
      const ids = (ds ?? []).map((d) => d.milestone_id);
      const { data: pays } = ids.length ? await supabase.from("payments").select("milestone_id, amount, refunded_amount, status, currency").in("milestone_id", ids).in("status", ["completed", "partially_refunded", "refunded"]) : { data: [] };
      return (ds ?? []).map((d) => ({ ...d, payment: (pays ?? []).find((p) => p.milestone_id === d.milestone_id) ?? null }));
    },
  });
  if (me?.role !== "admin") return <p className="text-muted-foreground">Only PacePay admins can see this page.</p>;
  const open = data.filter((d) => d.status === "open");
  const closed = data.filter((d) => d.status !== "open");
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Disputes</h1>
      <h2 className="text-xl font-semibold">Open ({open.length})</h2>
      {open.length === 0 && <p className="text-sm text-muted-foreground">No open disputes.</p>}
      {open.map((d) => <DisputeCard key={d.id} d={d} />)}
      <h2 className="pt-4 text-xl font-semibold">Resolved</h2>
      {closed.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4 text-sm">
          <span>{(d.projects as any)?.title} · {(d.milestones as any)?.title}</span>
          <span className="flex items-center gap-2">{d.outcome?.replace(/_/g, " ")}{d.refund_amount ? ` · ${money(d.refund_amount, (d.milestones as any)?.currency)}` : ""}<StatusBadge status={d.status} /></span>
        </div>
      ))}
    </div>
  );
}

function DisputeCard({ d }: { d: any }) {
  const qc = useQueryClient();
  const resolve = useServerFn(resolveDispute);
  const m = d.milestones;
  const pay = d.payment;
  const isPaid = m?.status === "paid";
  const remaining = pay ? Number(pay.amount) - Number(pay.refunded_amount) : 0;
  const [outcome, setOutcome] = useState(isPaid ? "no_refund" : "no_change");
  const [amount, setAmount] = useState(d.requested_refund ? String(d.requested_refund) : "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const r = await resolve({ data: { disputeId: d.id, outcome: outcome as any, refundAmount: outcome === "partial_refund" ? Number(amount) : null, notes } });
      toast.success(r.refundAmount ? `Resolved. Refunded ${money(r.refundAmount, m.currency)} via PayPal Sandbox.` : "Dispute resolved");
      qc.invalidateQueries();
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  }
  return (
    <div className="space-y-4 rounded-2xl border border-warning/40 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-semibold">{d.projects?.title} · <Link to="/milestones/$milestoneId" params={{ milestoneId: m.id }} className="text-primary hover:underline">{m.title}</Link></p><p className="text-xs text-muted-foreground">Opened {date(d.created_at)} by the {d.opened_by === d.projects?.client_id ? "client" : "freelancer"}</p></div>
        <span className="flex items-center gap-2 font-mono text-sm">{money(m.amount, m.currency)}<StatusBadge status={m.status} /></span>
      </div>
      <p className="whitespace-pre-wrap rounded-lg bg-secondary p-3 text-sm"><b>Reason:</b> {d.reason}</p>
      {d.requested_refund && <p className="text-sm">Requested refund: <b>{money(d.requested_refund, m.currency)}</b></p>}
      {isPaid && <p className="text-sm text-muted-foreground">Paid {money(pay?.amount ?? 0, m.currency)}, already refunded {money(pay?.refunded_amount ?? 0, m.currency)}, refundable {money(remaining, m.currency)}.</p>}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5"><Label>Decision</Label>
          <Select value={outcome} onValueChange={setOutcome}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            {isPaid ? <><SelectItem value="no_refund">No refund</SelectItem><SelectItem value="partial_refund">Partial refund</SelectItem><SelectItem value="full_refund">Full refund</SelectItem></>
              : <><SelectItem value="no_change">No change</SelectItem><SelectItem value="revision_required">Send back for revision</SelectItem><SelectItem value="approve">Approve the work</SelectItem></>}
          </SelectContent></Select>
        </div>
        {outcome === "partial_refund" && <div className="space-y-1.5"><Label>Refund amount ({m.currency})</Label><Input type="number" min={0.01} step={0.01} max={remaining} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>}
      </div>
      <div className="space-y-1.5"><Label>Decision notes (shared with both parties)</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Explain how much of the work was completed and why…" /></div>
      <Button onClick={submit} disabled={busy || notes.trim().length < 5}>{busy ? "Resolving…" : "Resolve dispute"}</Button>
    </div>
  );
}
