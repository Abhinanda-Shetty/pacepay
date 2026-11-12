import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban, Wallet, Clock, CalendarClock, Sparkles, CircleCheckBig } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { money, date } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Panel, Empty } from "@/components/Panel";
import { getOwnProjects } from "@/lib/project-access";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — PacePay" }, { name: "description", content: "Your PacePay overview." }, { property: "og:title", content: "Dashboard — PacePay" }, { property: "og:description", content: "Projects, approvals and payments at a glance." }] }),
  component: Dashboard,
});

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 font-display text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function Dashboard() {
  const { data: me } = useMe();
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [p, m, pay, r] = await Promise.all([
        supabase.from("projects").select("*"),
        supabase.from("milestones").select("*, projects(title)").order("deadline", { ascending: true, nullsFirst: false }),
        supabase.from("payments").select("*, milestones(title)").order("created_at", { ascending: false }),
        supabase.from("ai_reviews").select("id, recommendation, created_at, summary").order("created_at", { ascending: false }).limit(5),
      ]);
      return { projects: p.data ?? [], milestones: m.data ?? [], payments: pay.data ?? [], reviews: r.data ?? [] };
    },
  });
  const projects = getOwnProjects(data?.projects ?? [], me?.user.id ?? "", me?.role === "admin");
  const ms = data?.milestones ?? [];
  const active = projects.filter((p) => p.status === "active");
  const budget = active.reduce((s, p) => s + Number(p.budget), 0);
  const earned = (data?.payments ?? [])
    .filter((p) => p.payee_id === me?.user.id && ["completed", "partially_refunded", "refunded"].includes(p.status))
    .reduce((sum, p) => sum + Math.max(0, Number(p.amount) - Number(p.refunded_amount)), 0);
  const pending = ms.filter((m) => m.status === "submitted");
  const done = ms.filter((m) => m.status === "approved" || m.status === "paid").length;
  const upcoming = ms.filter((m) => m.deadline && !["approved", "paid"].includes(m.status)).slice(0, 5);
  const completedProjects = projects
    .filter((p) => p.status === "completed" && (me?.role !== "freelancer" || p.freelancer_id === me.user.id))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const recentPayments = (data?.payments ?? []).slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm text-muted-foreground">Welcome back</p><h1 className="text-3xl font-bold">{me?.profile?.name || "Dashboard"}</h1></div>
        {me?.role === "client" && <Button asChild><Link to="/projects/new">New project</Link></Button>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={FolderKanban} label="Active projects" value={active.length} />
        <Stat icon={Wallet} label={me?.role === "freelancer" ? "Earned" : "Active budget"} value={money(me?.role === "freelancer" ? earned : budget)} />
        <Stat icon={Clock} label="Pending approvals" value={pending.length} />
        <Stat icon={CalendarClock} label="Upcoming deadlines" value={upcoming.length} />
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex justify-between text-sm"><span>Milestone completion</span><span className="font-mono text-muted-foreground">{done}/{ms.length}</span></div>
        <Progress value={ms.length ? (done / ms.length) * 100 : 0} className="mt-3" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Upcoming deadlines">
          {upcoming.length === 0 && <Empty text="No upcoming deadlines." />}
          {upcoming.map((m) => (
            <Link key={m.id} to="/milestones/$milestoneId" params={{ milestoneId: m.id }} className="flex items-center justify-between rounded-lg p-2 hover:bg-secondary">
              <div><p className="text-sm font-medium">{m.title}</p><p className="text-xs text-muted-foreground">{(m.projects as any)?.title} · {date(m.deadline)}</p></div><StatusBadge status={m.status} />
            </Link>
          ))}
        </Panel>
        <Panel title="Recent transactions">
          {recentPayments.length === 0 && <Empty text="No payments yet." />}
          {recentPayments.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-2">
              <div><p className="text-sm font-medium">{(p.milestones as any)?.title}</p><p className="text-xs text-muted-foreground">{date(p.created_at)}</p></div>
              <div className="text-right"><p className="font-mono text-sm">{money(p.amount, p.currency)}</p><StatusBadge status={p.status} /></div>
            </div>
          ))}
        </Panel>
        <Panel title="AI workflow activity">
          {(data?.reviews ?? []).length === 0 && <Empty text="No AI reviews yet." />}
          {(data?.reviews ?? []).map((r) => (
            <div key={r.id} className="space-y-1 p-2"><div className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-primary" /><StatusBadge status={r.recommendation} /></div><p className="line-clamp-2 text-xs text-muted-foreground">{r.summary}</p></div>
          ))}
        </Panel>
      </div>
      {me?.role === "freelancer" && (
        <Panel title="Completed project timeline">
          {completedProjects.length === 0 && <Empty text="Your completed projects will appear here." />}
          <div className="space-y-1">
            {completedProjects.map((p) => (
              <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }} className="relative flex gap-4 rounded-xl p-3 hover:bg-secondary">
                <span className="mt-1 rounded-full bg-primary/10 p-2"><CircleCheckBig className="h-4 w-4 text-primary" /></span>
                <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{p.title}</span><span className="font-mono text-sm text-primary">{money(p.budget, p.currency)}</span></span><span className="mt-1 block text-xs text-muted-foreground">Completed {date(p.updated_at)} · {p.category || "Freelance project"}</span></span>
              </Link>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
