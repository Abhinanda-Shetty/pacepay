import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { date } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — PacePay" }, { name: "description", content: "Your PacePay notifications." }, { property: "og:title", content: "Notifications — PacePay" }, { property: "og:description", content: "Submissions, approvals, payments and reminders." }] }),
  component: Notifications,
});

function Notifications() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  async function markAll() {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-3xl font-bold">Notifications</h1><Button variant="outline" size="sm" onClick={markAll}>Mark all read</Button></div>
      {data.length === 0 && <p className="text-muted-foreground">You're all caught up.</p>}
      <div className="space-y-2">
        {data.map((n) => {
          const inner = (
            <div className={cn("rounded-xl border border-border bg-card p-4", !n.read_at && "border-primary/40")}>
              <div className="flex items-center justify-between gap-2"><p className="font-medium">{!n.read_at && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary" />}{n.title}</p><span className="text-xs text-muted-foreground">{date(n.created_at)}</span></div>
              <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
            </div>
          );
          const id = n.link?.startsWith("/milestones/") ? n.link.split("/")[2] : null;
          return id ? <Link key={n.id} to="/milestones/$milestoneId" params={{ milestoneId: id }} className="block">{inner}</Link> : <div key={n.id}>{inner}</div>;
        })}
      </div>
    </div>
  );
}
