import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList, ShieldCheck, Sparkles, Wallet, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PacePay — Milestones verified by AI, paid with PayPal" },
      { name: "description", content: "PacePay helps clients and freelancers plan milestones, verify deliverables with AI and settle payments through PayPal." },
      { property: "og:title", content: "PacePay — Milestones verified by AI, paid with PayPal" },
      { property: "og:description", content: "Plan milestones, verify work with AI, approve and pay via PayPal Sandbox." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const steps = [
  { icon: ClipboardList, title: "Plan", text: "Describe the project. AI drafts milestones, budget split and risks — you confirm." },
  { icon: Sparkles, title: "Verify", text: "Freelancers submit evidence. AI checks it against each requirement and flags gaps." },
  { icon: ShieldCheck, title: "Approve", text: "The client always makes the final call: approve or request a revision." },
  { icon: Wallet, title: "Pay", text: "Approved milestones are paid through PayPal and reconciled automatically." },
];

function Index() {
  return (
    <div className="min-h-screen bg-background bg-hero">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-6">
        <Logo />
        <Button asChild variant="ghost"><Link to="/auth">Sign in</Link></Button>
      </header>
      <section className="mx-auto max-w-4xl px-6 pb-20 pt-16 text-center">
        <p className="mx-auto inline-flex rounded-full border border-border bg-card px-3 py-1 font-mono text-xs text-primary">AI milestone coordination · PayPal Sandbox</p>
        <h1 className="mt-6 text-5xl font-bold leading-tight md:text-6xl">
          Get paid at the pace <br />of <span className="bg-gradient-primary bg-clip-text text-transparent">finished work.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          PacePay keeps clients and freelancers aligned on every milestone — clear requirements, AI-checked deliverables, human approval and PayPal payouts in one place.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Button asChild size="lg" className="bg-gradient-primary shadow-glow"><Link to="/auth">Start a project <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Not a marketplace and not escrow — bring your existing client or freelancer.</p>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 md:grid-cols-4">
        {steps.map((s, i) => (
          <div key={s.title} className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <s.icon className="h-6 w-6 text-primary" />
              <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
            </div>
            <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
