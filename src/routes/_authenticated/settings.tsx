import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bell, CreditCard, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — PacePay" }, { name: "description", content: "Profile and account settings." }, { property: "og:title", content: "Settings — PacePay" }, { property: "og:description", content: "Manage your PacePay profile." }] }),
  component: Settings,
});

function Settings() {
  const { data: me, refetch } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => setName(me?.profile?.name ?? ""), [me?.profile?.name]);

  async function save() {
    if (!name.trim()) { toast.error("Your name cannot be empty"); return; }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ name: name.trim(), updated_at: new Date().toISOString() }).eq("id", me!.user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile saved");
    refetch();
  }

  async function signOut() {
    setSigningOut(true);
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const paypalReady = Boolean(import.meta.env["VITE_LOVABLE_CONNECTOR_PAYPAL_CLIENT_ID"]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div><h1 className="text-3xl font-bold">Settings</h1><p className="mt-1 text-sm text-muted-foreground">Manage your profile, account and workspace preferences.</p></div>
      <section className="space-y-5 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-primary/10 p-2"><UserRound className="h-5 w-5 text-primary" /></span><div><h2 className="font-semibold">Profile</h2><p className="text-sm text-muted-foreground">This name appears on your projects and reviews.</p></div></div>
        <div className="space-y-1.5"><Label htmlFor="profile-name">Display name</Label><Input id="profile-name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 text-sm">
          <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /><h2 className="font-semibold">Account</h2></div>
          <div><p className="text-xs text-muted-foreground">Email</p><p className="mt-1 break-all">{me?.user.email}</p></div>
          <div><p className="text-xs text-muted-foreground">Role</p><p className="mt-1 flex items-center gap-2 capitalize"><ShieldCheck className="h-4 w-4 text-primary" />{me?.role}</p></div>
        </section>
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 text-sm">
          <div className="flex items-center gap-2"><Bell className="h-4 w-4 text-primary" /><h2 className="font-semibold">Notifications</h2></div>
          <p className="text-muted-foreground">In-app updates are on for submissions, AI reviews, approvals, payments and reminders.</p>
          <div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /><span className={`h-2 w-2 rounded-full ${paypalReady ? "bg-primary" : "bg-destructive"}`} />{paypalReady ? "PayPal Sandbox connected" : "PayPal not configured"}</div>
        </section>
      </div>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6">
        <div><h2 className="font-semibold">Sign out</h2><p className="mt-1 text-sm text-muted-foreground">End this session on the current device.</p></div>
        <Button variant="outline" onClick={signOut} disabled={signingOut}><LogOut className="mr-2 h-4 w-4" />{signingOut ? "Signing out…" : "Sign out"}</Button>
      </section>
    </div>
  );
}
