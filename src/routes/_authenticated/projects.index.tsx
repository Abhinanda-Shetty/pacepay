import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { money, date } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({ meta: [{ title: "Projects — PacePay" }, { name: "description", content: "All your PacePay projects." }, { property: "og:title", content: "Projects — PacePay" }, { property: "og:description", content: "Your projects and invites." }] }),
  component: Projects,
});

function Projects() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await supabase.from("projects").select("*, milestones(status)").order("created_at", { ascending: false })).data ?? [],
  });
  const invites = projects.filter((p) => !p.freelancer_id && p.client_id !== me?.user.id);
  const mine = projects.filter((p) => !invites.includes(p));

  async function join(id: string) {
    const { error } = await supabase.rpc("join_project", { _project_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("You joined the project");
    qc.invalidateQueries();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Projects</h1>
        {me?.role === "client" && <Button asChild><Link to="/projects/new">New project</Link></Button>}
      </div>
      {invites.length > 0 && (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
          <h2 className="font-semibold">Pending invites</h2>
          {invites.map((p) => (
            <div key={p.id} className="mt-3 flex items-center justify-between">
              <div><p className="font-medium">{p.title}</p><p className="text-xs text-muted-foreground">{money(p.budget, p.currency)} · due {date(p.deadline)}</p></div>
              <Button size="sm" onClick={() => join(p.id)} disabled={me?.role !== "freelancer"}>Join project</Button>
            </div>
          ))}
        </div>
      )}
      {mine.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          {me?.role === "client" ? "No projects yet — create your first one." : "No projects yet. Ask your client to invite your email."}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {mine.map((p) => {
            const ms = (p.milestones as any[]) ?? [];
            const done = ms.filter((m) => m.status === "approved" || m.status === "paid").length;
            return (
              <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }} className="rounded-2xl border border-border bg-card p-5 transition hover:border-primary">
                <div className="flex items-start justify-between gap-2"><h2 className="font-semibold">{p.title}</h2><StatusBadge status={p.status} /></div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                <div className="mt-4 flex justify-between font-mono text-xs text-muted-foreground">
                  <span>{money(p.budget, p.currency)}</span><span>{done}/{ms.length} milestones</span><span>due {date(p.deadline)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
