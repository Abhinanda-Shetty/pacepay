import { createFileRoute, redirect, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LayoutDashboard, FolderKanban, Sparkles, CreditCard, Bell, Settings, LogOut, Briefcase, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, type Role } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: AppShell,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/ai", label: "AI Workflow", icon: Sparkles },
  { to: "/payments", label: "Payments", icon: CreditCard },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AppShell() {
  const { data: me, isLoading, refetch } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (isLoading || !me) return <div className="min-h-screen bg-background" />;
  if (!me.role) return <Onboarding userId={me.user.id} onDone={() => refetch()} />;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <Link to="/dashboard" className="mb-8 px-2"><Logo /></Link>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((n) => {
            const active = path.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors", active ? "bg-sidebar-accent text-primary" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground")}>
                <n.icon className="h-4 w-4" /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border pt-4">
          <p className="truncate px-2 text-sm font-medium">{me.profile?.name || me.user.email}</p>
          <p className="px-2 text-xs capitalize text-primary">{me.role}</p>
          <Button variant="ghost" size="sm" className="mt-2 w-full justify-start text-muted-foreground" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border p-3 md:hidden">
          <Logo />
          <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2 md:hidden">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className={cn("shrink-0 rounded-md px-3 py-1.5 text-xs", path.startsWith(n.to) ? "bg-secondary text-primary" : "text-muted-foreground")}>{n.label}</Link>
          ))}
        </nav>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Onboarding({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function pick(role: Role) {
    setBusy(true);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Welcome aboard, ${role}!`);
    onDone();
  }
  const opts = [
    { role: "client" as Role, icon: Briefcase, title: "I'm a client", text: "Create projects, define milestones, review AI-checked work and pay via PayPal." },
    { role: "freelancer" as Role, icon: UserRound, title: "I'm a freelancer", text: "Join projects you're invited to, submit deliverables and get paid on approval." },
  ];
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background bg-hero p-6">
      <Logo />
      <h1 className="mt-8 text-3xl font-bold">How will you use PacePay?</h1>
      <p className="mt-2 text-muted-foreground">This choice is permanent for your account.</p>
      <div className="mt-8 grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        {opts.map((o) => (
          <button key={o.role} disabled={busy} onClick={() => pick(o.role)} className="rounded-2xl border border-border bg-card p-6 text-left transition hover:border-primary hover:shadow-glow disabled:opacity-50">
            <o.icon className="h-8 w-8 text-primary" />
            <h2 className="mt-4 text-lg font-semibold">{o.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{o.text}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
