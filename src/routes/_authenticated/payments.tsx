import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { money, date } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({ meta: [{ title: "Payments — PacePay" }, { name: "description", content: "PayPal payment history." }, { property: "og:title", content: "Payments — PacePay" }, { property: "og:description", content: "Payment history and PayPal references." }] }),
  component: Payments,
});

function Payments() {
  const { data = [] } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => (await supabase.from("payments").select("*, projects(title), milestones(title)").order("created_at", { ascending: false })).data ?? [],
  });
  const total = data.filter((p) => p.status === "completed").reduce((s, p) => s + Number(p.amount), 0);
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between"><h1 className="text-3xl font-bold">Payments</h1><p className="font-mono text-sm text-muted-foreground">Completed: <span className="text-primary">{money(total)}</span></p></div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Project</TableHead><TableHead>Milestone</TableHead><TableHead>Amount</TableHead><TableHead>PayPal reference</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No payments yet.</TableCell></TableRow>}
            {data.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{date(p.created_at)}</TableCell>
                <TableCell>{(p.projects as any)?.title}</TableCell>
                <TableCell><Link to="/milestones/$milestoneId" params={{ milestoneId: p.milestone_id }} className="hover:text-primary">{(p.milestones as any)?.title}</Link></TableCell>
                <TableCell className="font-mono">{money(p.amount, p.currency)}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{p.paypal_capture_id ?? p.paypal_order_id}</TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">PayPal Sandbox — no real money moves. PacePay doesn't hold funds or offer escrow.</p>
    </div>
  );
}
