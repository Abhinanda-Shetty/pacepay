import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { money, date } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({ meta: [{ title: "Project — PacePay" }, { name: "description", content: "Project milestones and progress." }, { property: "og:title", content: "Project — PacePay" }, { property: "og:description", content: "Milestones, budget and deadlines." }] }),
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data: p } = await supabase.from("projects").select("*").eq("id", projectId).single();
      const { data: ms } = await supabase.from("milestones").select("*").eq("project_id", projectId).order("sequence");
      let freelancer = null;
      if (p?.freelancer_id) freelancer = (await supabase.from("profiles").select("name, email").eq("id", p.freelancer_id).maybeSingle()).data;
      return { p, ms: ms ?? [], freelancer };
    },
  });
  const [email, setEmail] = useState("");
  if (!data?.p) return <p className="text-muted-foreground">Loading…</p>;
  const { p, ms, freelancer } = data;
  const isClient = me?.user.id === p.client_id;
  const paid = ms.filter((m) => m.status === "paid").reduce((s, m) => s + Number(m.amount), 0);
  const done = ms.filter((m) => ["approved", "paid"].includes(m.status)).length;

  async function invite() {
    const { error } = await supabase.from("projects").update({ freelancer_email: email.trim(), updated_at: new Date().toISOString() }).eq("id", p!.id);
    if (error) return toast.error(error.message);
    toast.success("Invite saved — the freelancer will see it after signing in with that email");
    qc.invalidateQueries({ queryKey: ["project", projectId] });
  }
  async function setStatus(status: "active" | "completed" | "cancelled") {
    const { error } = await supabase.from("projects").update({ status }).eq("id", p!.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["project", projectId] });
  }

  return (
    <div className="space-y-8">
      <div>
        <Link to="/projects" className="text-sm text-muted-foreground hover:text-foreground">← Projects</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold">{p.title}</h1><StatusBadge status={p.status} /></div>
        <p className="mt-2 max-w-3xl text-muted-foreground">{p.description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Info label="Budget" value={money(p.budget, p.currency)} />
        <Info label="Paid out" value={money(paid, p.currency)} />
        <Info label="Deadline" value={date(p.deadline)} />
        <Info label="Freelancer" value={freelancer ? freelancer.name || freelancer.email : p.freelancer_email ? `Invited: ${p.freelancer_email}` : "Not assigned"} />
      </div>
      {isClient && !p.freelancer_id && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-4">
          <span className="text-sm">Invite freelancer by email</span>
          <Input className="max-w-xs" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={p.freelancer_email ?? "freelancer@example.com"} />
          <Button size="sm" onClick={invite} disabled={!email}>Save invite</Button>
        </div>
      )}
      {p.requirements && (
        <div className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">Requirements</h2><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{p.requirements}</p></div>
      )}
      <div>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-semibold">Milestones</h2><span className="font-mono text-sm text-muted-foreground">{done}/{ms.length} complete</span></div>
        <Progress value={ms.length ? (done / ms.length) * 100 : 0} className="mb-4" />
        <div className="space-y-2">
          {ms.map((m) => (
            <Link key={m.id} to="/milestones/$milestoneId" params={{ milestoneId: m.id }} className="flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:border-primary">
              <div><p className="font-medium"><span className="mr-2 font-mono text-xs text-primary">#{m.sequence}</span>{m.title}</p><p className="text-xs text-muted-foreground">due {date(m.deadline)}</p></div>
              <div className="flex items-center gap-3"><span className="font-mono text-sm">{money(m.amount, m.currency)}</span><StatusBadge status={m.status} /></div>
            </Link>
          ))}
          {ms.length === 0 && <p className="text-sm text-muted-foreground">No milestones.</p>}
        </div>
      </div>
      {isClient && (
        <div className="flex gap-2">
          {p.status !== "completed" && <Button variant="outline" onClick={() => setStatus("completed")}>Mark project completed</Button>}
          {p.status === "active" && <Button variant="ghost" onClick={() => setStatus("cancelled")}>Cancel project</Button>}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate font-semibold">{value}</p></div>;
}
