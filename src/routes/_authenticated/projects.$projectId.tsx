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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Star } from "lucide-react";

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
      const { data: apps } = await supabase.from("applications").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
      const appIds = (apps ?? []).map((a) => a.freelancer_id);
      const { data: appProfiles } = appIds.length ? await supabase.from("profiles").select("id, name, email").in("id", appIds) : { data: [] };
      const appRatings = await Promise.all(appIds.map(async (id) => [id, (await supabase.rpc("user_rating", { _user_id: id })).data?.[0]] as const));
      const { data: ratings } = await supabase.from("ratings").select("*").eq("project_id", projectId);
      return { p, ms: ms ?? [], freelancer, apps: (apps ?? []).map((a) => ({ ...a, profile: appProfiles?.find((x) => x.id === a.freelancer_id), rating: appRatings.find((r) => r[0] === a.freelancer_id)?.[1] })), ratings: ratings ?? [] };
    },
  });
  const [email, setEmail] = useState("");
  if (!data?.p) return <p className="text-muted-foreground">Loading…</p>;
  const { p, ms, freelancer, apps, ratings } = data;
  const isClient = me?.user.id === p.client_id;
  const paid = ms.filter((m) => m.status === "paid").reduce((s, m) => s + Number(m.amount), 0);
  const done = ms.filter((m) => ["approved", "paid"].includes(m.status)).length;

  async function invite() {
    const { error } = await supabase.from("projects").update({ freelancer_email: email.trim(), updated_at: new Date().toISOString() }).eq("id", p!.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Invite saved — the freelancer will see it after signing in with that email");
    qc.invalidateQueries({ queryKey: ["project", projectId] });
  }
  async function setPublic(is_public: boolean) {
    const { error } = await supabase.from("projects").update({ is_public }).eq("id", p!.id);
    if (error) { toast.error(error.message); return; }
    toast.success(is_public ? "Posted on the job board" : "Removed from the job board");
    qc.invalidateQueries({ queryKey: ["project", projectId] });
  }
  async function decideApp(id: string, accept: boolean) {
    const { error } = await supabase.rpc(accept ? "accept_application" : "reject_application", { _application_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success(accept ? "Freelancer hired" : "Application declined");
    qc.invalidateQueries();
  }
  async function setStatus(status: "active" | "completed" | "cancelled") {
    const { error } = await supabase.from("projects").update({ status }).eq("id", p!.id);
    if (error) { toast.error(error.message); return; }
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
      {isClient && !p.freelancer_id && p.status === "active" && (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between"><div><h2 className="font-semibold">Job board</h2><p className="text-sm text-muted-foreground">Let freelancers find this project and apply.</p></div><Switch checked={p.is_public} onCheckedChange={setPublic} /></div>
          <h3 className="text-sm font-semibold">Applications ({apps.length})</h3>
          {apps.length === 0 && <p className="text-sm text-muted-foreground">No applications yet.</p>}
          {apps.map((a) => (
            <div key={a.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="font-medium">{a.profile?.name || a.profile?.email || "Freelancer"}</p><p className="flex items-center gap-1 text-xs text-muted-foreground"><Star className="h-3 w-3 text-warning" />{a.rating?.rating_count ? `${a.rating.avg_rating} (${a.rating.rating_count})` : "No ratings yet"}{a.proposed_amount ? ` · proposes ${money(a.proposed_amount, p.currency)}` : ""}</p></div>
                {a.status === "pending" ? <div className="flex gap-2"><Button size="sm" onClick={() => decideApp(a.id, true)}>Hire</Button><Button size="sm" variant="ghost" onClick={() => decideApp(a.id, false)}>Decline</Button></div> : <StatusBadge status={a.status} />}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{a.cover_letter}</p>
            </div>
          ))}
        </div>
      )}
      {p.status === "completed" && p.freelancer_id && (isClient || me?.user.id === p.freelancer_id) && (
        <Ratings p={p} ratings={ratings} userId={me!.user.id} onDone={() => qc.invalidateQueries({ queryKey: ["project", projectId] })} />
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
          {p.status === "active" && <Button variant="outline" onClick={() => setStatus("completed")}>Mark project completed</Button>}
          {p.status === "active" && <Button variant="ghost" onClick={() => setStatus("cancelled")}>Cancel project</Button>}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate font-semibold">{value}</p></div>;
}

function Ratings({ p, ratings, userId, onDone }: { p: any; ratings: any[]; userId: string; onDone: () => void }) {
  const mine = ratings.find((r) => r.reviewer_id === userId);
  const theirs = ratings.find((r) => r.reviewee_id === userId);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const other = userId === p.client_id ? p.freelancer_id : p.client_id;
  async function save() {
    const { error } = await supabase.from("ratings").insert({ project_id: p.id, reviewer_id: userId, reviewee_id: other, rating: stars, comment: comment.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success("Thanks for your review"); onDone();
  }
  const Stars = ({ n }: { n: number }) => <span className="inline-flex">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`h-4 w-4 ${i <= n ? "fill-warning text-warning" : "text-muted-foreground"}`} />)}</span>;
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-semibold">Ratings & reviews</h2>
      {mine ? <p className="text-sm">You rated the {userId === p.client_id ? "freelancer" : "client"}: <Stars n={mine.rating} /> {mine.comment}</p> : (
        <div className="space-y-2">
          <p className="text-sm">Rate the {userId === p.client_id ? "freelancer" : "client"} for this project:</p>
          <div className="flex gap-1">{[1, 2, 3, 4, 5].map((i) => <button key={i} aria-label={`${i} stars`} onClick={() => setStars(i)}><Star className={`h-6 w-6 ${i <= stars ? "fill-warning text-warning" : "text-muted-foreground"}`} /></button>)}</div>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} placeholder="How did it go? (optional)" />
          <Button size="sm" onClick={save}>Submit review</Button>
        </div>
      )}
      {theirs && <p className="text-sm text-muted-foreground">They rated you: <Stars n={theirs.rating} /> {theirs.comment}</p>}
    </div>
  );
}
