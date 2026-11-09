import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { BellRing, ClipboardList, ShieldCheck, Wallet, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendReminders } from "@/lib/pacepay.functions";
import { AIReview } from "@/components/AIReview";
import { StatusBadge } from "@/components/StatusBadge";
import { Panel, Empty } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { date } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({ meta: [{ title: "AI Workflow Center — PacePay" }, { name: "description", content: "AI planning, verification and reminders." }, { property: "og:title", content: "AI Workflow Center — PacePay" }, { property: "og:description", content: "Pending reviews and AI recommendations." }] }),
  component: AIPage,
});

const agents = [
  { icon: ClipboardList, name: "Planning agent", text: "Drafts milestones, budget split and risks when you create a project." },
  { icon: ShieldCheck, name: "Verification agent", text: "Checks each submission against the milestone's requirements." },
  { icon: BellRing, name: "Approval & reminder agent", text: "Flags pending approvals and overdue milestones." },
  { icon: Wallet, name: "Payment agent", text: "Verifies approval, amount and payer before any PayPal capture." },
];

function AIPage() {
  const qc = useQueryClient();
  const remind = useServerFn(sendReminders);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["ai-center"],
    queryFn: async () => {
      const [pending, reviews] = await Promise.all([
        supabase.from("milestones").select("id, title, deadline, status, projects(title)").eq("status", "submitted"),
        supabase.from("ai_reviews").select("*, submissions(milestone_id, version, milestones(title))").order("created_at", { ascending: false }).limit(20),
      ]);
      return { pending: pending.data ?? [], reviews: reviews.data ?? [] };
    },
  });

  async function run() {
    setBusy(true);
    try { const r = await remind(); toast.success(`${r.created} reminder(s) created`); qc.invalidateQueries(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">AI Workflow Center</h1>
        <Button onClick={run} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellRing className="mr-2 h-4 w-4" />}Run reminder check</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {agents.map((a) => (
          <div key={a.name} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between"><a.icon className="h-5 w-5 text-primary" /><span className="flex items-center gap-1 text-xs text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" />active</span></div>
            <p className="mt-3 font-semibold">{a.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{a.text}</p>
          </div>
        ))}
      </div>
      <Panel title="Pending review items">
        {(data?.pending ?? []).length === 0 && <Empty text="Nothing waiting for review." />}
        {(data?.pending ?? []).map((m) => (
          <Link key={m.id} to="/milestones/$milestoneId" params={{ milestoneId: m.id }} className="flex items-center justify-between rounded-lg p-2 hover:bg-secondary">
            <span className="text-sm">{m.title} <span className="text-muted-foreground">· {(m.projects as any)?.title}</span></span>
            <StatusBadge status={m.status} />
          </Link>
        ))}
      </Panel>
      <div>
        <h2 className="mb-3 text-xl font-semibold">AI recommendations</h2>
        {(data?.reviews ?? []).length === 0 && <Empty text="No AI reviews yet." />}
        <div className="space-y-4">
          {(data?.reviews ?? []).map((r) => {
            const s = r.submissions as any;
            return (
              <div key={r.id}>
                <Link to="/milestones/$milestoneId" params={{ milestoneId: s.milestone_id }} className="text-sm font-medium hover:text-primary">{s.milestones?.title} · v{s.version} <span className="text-xs text-muted-foreground">({date(r.created_at)})</span></Link>
                <AIReview r={r} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
