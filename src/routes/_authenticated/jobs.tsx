import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { money, date } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({ meta: [{ title: "Job board — PacePay" }, { name: "description", content: "Search open freelance projects and apply." }, { property: "og:title", content: "Job board — PacePay" }, { property: "og:description", content: "Find milestone-based freelance work." }] }),
  component: Jobs,
});

function Jobs() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [minB, setMinB] = useState("");
  const [maxB, setMaxB] = useState("");
  const [sort, setSort] = useState("newest");
  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => (await supabase.from("projects").select("id, title, description, requirements, budget, currency, deadline, category, skills, created_at, client_id").eq("is_public", true).is("freelancer_id", null).eq("status", "active").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: mine = [] } = useQuery({
    queryKey: ["my-applications"],
    enabled: me?.role === "freelancer",
    queryFn: async () => (await supabase.from("applications").select("id, project_id, status").eq("freelancer_id", me!.user.id)).data ?? [],
  });
  const cats = useMemo(() => Array.from(new Set(jobs.map((j) => j.category).filter(Boolean))).sort(), [jobs]);
  const list = jobs
    .filter((j) => {
      const t = q.trim().toLowerCase();
      if (t && ![j.title, j.description, j.requirements, j.category, ...(j.skills ?? [])].join(" ").toLowerCase().includes(t)) return false;
      if (cat !== "all" && j.category !== cat) return false;
      if (minB && Number(j.budget) < Number(minB)) return false;
      if (maxB && Number(j.budget) > Number(maxB)) return false;
      return true;
    })
    .sort((a, b) => sort === "budget_high" ? Number(b.budget) - Number(a.budget) : sort === "budget_low" ? Number(a.budget) - Number(b.budget) : sort === "deadline" ? (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") : b.created_at.localeCompare(a.created_at));

  async function withdraw(id: string) {
    const { error } = await supabase.rpc("withdraw_application", { _application_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Application withdrawn");
    qc.invalidateQueries({ queryKey: ["my-applications"] });
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold">Job board</h1><p className="text-muted-foreground">Open projects looking for a freelancer.</p></div>
      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-5">
        <div className="relative md:col-span-2"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search title, skills, requirements…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={cat} onValueChange={setCat}><SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <div className="flex gap-2"><Input type="number" min={0} placeholder="Min $" value={minB} onChange={(e) => setMinB(e.target.value)} /><Input type="number" min={0} placeholder="Max $" value={maxB} onChange={(e) => setMaxB(e.target.value)} /></div>
        <Select value={sort} onValueChange={setSort}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="newest">Newest</SelectItem><SelectItem value="budget_high">Budget: high to low</SelectItem><SelectItem value="budget_low">Budget: low to high</SelectItem><SelectItem value="deadline">Deadline soonest</SelectItem></SelectContent></Select>
      </div>
      <p className="text-sm text-muted-foreground">{list.length} job{list.length === 1 ? "" : "s"}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {list.map((j) => {
          const app = mine.find((a) => a.project_id === j.id);
          const own = j.client_id === me?.user.id;
          return (
            <div key={j.id} className="flex flex-col rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-2"><h2 className="font-semibold">{j.title}</h2>{j.category && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{j.category}</span>}</div>
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{j.description}</p>
              {j.skills?.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{j.skills.map((s: string) => <span key={s} className="rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">{s}</span>)}</div>}
              <div className="mt-4 flex justify-between font-mono text-xs text-muted-foreground"><span className="text-primary">{money(j.budget, j.currency)}</span><span>due {date(j.deadline)}</span></div>
              <div className="mt-4 flex items-center gap-2">
                {own ? <Button asChild size="sm" variant="outline"><Link to="/projects/$projectId" params={{ projectId: j.id }}>View applicants</Link></Button>
                  : me?.role !== "freelancer" ? <span className="text-xs text-muted-foreground">Only freelancers can apply</span>
                  : app ? <><StatusBadge status={app.status} />{app.status === "pending" && <Button size="sm" variant="ghost" onClick={() => withdraw(app.id)}>Withdraw</Button>}</>
                  : <ApplyDialog job={j} userId={me.user.id} onDone={() => qc.invalidateQueries({ queryKey: ["my-applications"] })} />}
              </div>
            </div>
          );
        })}
        {list.length === 0 && <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground md:col-span-2">No open jobs match your filters.</div>}
      </div>
    </div>
  );
}

function ApplyDialog({ job, userId, onDone }: { job: any; userId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [letter, setLetter] = useState("");
  const [amount, setAmount] = useState("");
  async function apply() {
    if (letter.trim().length < 10) { toast.error("Write at least a short pitch (10+ characters)"); return; }
    const { error } = await supabase.from("applications").insert({ project_id: job.id, freelancer_id: userId, cover_letter: letter.trim(), proposed_amount: amount ? Number(amount) : null });
    if (error) { toast.error(error.message); return; }
    toast.success("Application sent");
    setOpen(false); onDone();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm">Apply</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Apply to “{job.title}”</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Why you're a good fit</Label><Textarea rows={6} value={letter} onChange={(e) => setLetter(e.target.value)} maxLength={5000} /></div>
          <div className="space-y-1.5"><Label>Your proposed total ({job.currency}, optional)</Label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(job.budget)} /></div>
        </div>
        <DialogFooter><Button onClick={apply}>Send application</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
