import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  const [name, setName] = useState("");
  useEffect(() => setName(me?.profile?.name ?? ""), [me?.profile?.name]);
  async function save() {
    const { error } = await supabase.from("profiles").update({ name, updated_at: new Date().toISOString() }).eq("id", me!.user.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile saved");
    refetch();
  }
  const paypalReady = Boolean(import.meta.env["VITE_LOVABLE_CONNECTOR_PAYPAL_CLIENT_ID"]);
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold">Profile</h2>
        <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <Button onClick={save}>Save</Button>
      </section>
      <section className="space-y-2 rounded-2xl border border-border bg-card p-6 text-sm">
        <h2 className="font-semibold">Account</h2>
        <p><span className="text-muted-foreground">Email:</span> {me?.user.email}</p>
        <p><span className="text-muted-foreground">Role:</span> <span className="capitalize text-primary">{me?.role}</span></p>
      </section>
      <section className="space-y-2 rounded-2xl border border-border bg-card p-6 text-sm">
        <h2 className="font-semibold">Notification preferences</h2>
        <p className="text-muted-foreground">In-app notifications are on for submissions, approvals, payments and reminders.</p>
      </section>
      <section className="space-y-2 rounded-2xl border border-border bg-card p-6 text-sm">
        <h2 className="font-semibold">PayPal Sandbox</h2>
        <p className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${paypalReady ? "bg-primary" : "bg-destructive"}`} />{paypalReady ? "Connected (Sandbox)" : "Not configured"}</p>
      </section>
    </div>
  );
}
