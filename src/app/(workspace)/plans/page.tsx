"use client";

import { Check, Coins, Crown, Rocket, Shield } from "lucide-react";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { BorderBeam } from "@/components/ui/border-beam";
import { MagicCard } from "@/components/ui/magic-card";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { SparklesText } from "@/components/ui/sparkles-text";
import { cn } from "@/lib/utils";

const plans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    tag: "Default",
    icon: Coins,
    accent: "amber",
    description: "無料で回すための標準枠。今の運用はこれ前提です。",
    features: ["Daily 500 credits", "Canvas + attachments", "Standard queue", "Basic audit trail"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$24",
    tag: "Coming soon",
    icon: Crown,
    accent: "rose",
    description: "重いモデルをもっと雑に叩きたい人向け。見た目だけ先に完成。",
    features: ["Larger daily credit pool", "Priority generation", "Faster refill options", "Advanced image quota"],
  },
  {
    id: "team",
    name: "Team",
    price: "$79",
    tag: "Coming soon",
    icon: Rocket,
    accent: "sky",
    description: "複数人運用と監査を本気でやる時の席。まだ決済は未接続。",
    features: ["Shared workspaces", "Central admin controls", "Expanded audit visibility", "Team-level billing later"],
  },
] as const;

const accentClassMap = {
  amber: "from-amber-400/30 to-orange-300/10",
  rose: "from-rose-400/30 to-fuchsia-300/10",
  sky: "from-sky-400/30 to-cyan-300/10",
} as const;

export default function PlansPage() {
  return (
    <section className="relative min-h-full overflow-hidden rounded-[32px] border border-neutral-200/70 bg-[linear-gradient(180deg,#fffdfa_0%,#f4f1ea_100%)] p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]">
      <AnimatedGridPattern
        width={42}
        height={42}
        x={-1}
        y={-1}
        className="absolute inset-0 h-full w-full fill-neutral-300/30 stroke-neutral-300/30 [mask-image:radial-gradient(ellipse_at_top,white,transparent_72%)]"
      />

      <div className="relative z-10 flex flex-col gap-8">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">Plans</p>
          <SparklesText className="text-4xl font-semibold tracking-tight text-neutral-950" sparklesCount={7}>
            Pricing shell, visually done
          </SparklesText>
          <p className="max-w-3xl text-sm leading-6 text-neutral-600">
            決済はまだ未接続。でも画面は先に完成させます。無料クレジット運用から、そのまま有料プランへ拡張できる形にしてあります。
          </p>
        </header>

        <div className="grid gap-5 xl:grid-cols-3">
          {plans.map((plan) => {
            const Icon = plan.icon;
            return (
              <MagicCard key={plan.id} className="rounded-[30px]">
                <article className="relative h-full overflow-hidden rounded-[30px] bg-white p-7">
                  <BorderBeam
                    size={320}
                    duration={6}
                    colorFrom={plan.id === "free" ? "#f59e0b" : plan.id === "pro" ? "#fb7185" : "#38bdf8"}
                    colorTo={plan.id === "free" ? "#fb7185" : plan.id === "pro" ? "#c084fc" : "#22d3ee"}
                  />
                  <div className={cn("absolute inset-x-0 top-0 h-28 bg-gradient-to-br opacity-80", accentClassMap[plan.accent])} />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-3">
                        <div className="flex size-12 items-center justify-center rounded-2xl border border-white/60 bg-white/80 text-neutral-900 shadow-sm">
                          <Icon className="size-5" />
                        </div>
                        <div>
                          <h2 className="text-2xl font-semibold text-neutral-950">{plan.name}</h2>
                          <p className="mt-2 text-sm leading-6 text-neutral-600">{plan.description}</p>
                        </div>
                      </div>
                      <span className="rounded-full border border-neutral-200 bg-white/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-500">
                        {plan.tag}
                      </span>
                    </div>

                    <div className="mt-8 flex items-end gap-2">
                      <p className="text-5xl font-semibold tracking-tight text-neutral-950">{plan.price}</p>
                      <span className="pb-1 text-sm text-neutral-500">/ month</span>
                    </div>

                    <div className="mt-8 space-y-3">
                      {plan.features.map((feature) => (
                        <div key={feature} className="flex items-start gap-3 rounded-[20px] border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                          <div className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-neutral-900 text-white">
                            <Check className="size-3" />
                          </div>
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-8">
                      <ShimmerButton
                        className="h-12 w-full rounded-2xl text-sm font-semibold"
                        background={plan.id === "free" ? "rgba(24,24,27,1)" : "rgba(10,10,10,1)"}
                      >
                        {plan.id === "free" ? "Current free path" : "Billing hookup later"}
                      </ShimmerButton>
                    </div>
                  </div>
                </article>
              </MagicCard>
            );
          })}
        </div>

        <MagicCard className="rounded-[28px]">
          <section className="relative overflow-hidden rounded-[28px] bg-neutral-950 px-7 py-8 text-white">
            <BorderBeam size={260} duration={7} colorFrom="#f59e0b" colorTo="#22d3ee" />
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/70">
                  <Shield className="size-3.5" />
                  Rollout note
                </div>
                <h3 className="mt-4 text-2xl font-semibold">Good enough for launch visuals</h3>
                <p className="mt-3 text-sm leading-6 text-white/70">
                  見た目はもう十分。あとは決済接続、上限変更 UI、請求履歴をつなげれば商用っぽさは出ます。
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/50">Today</p>
                  <p className="mt-2 text-lg font-medium">Daily free-credit model is live</p>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/50">Later</p>
                  <p className="mt-2 text-lg font-medium">Stripe or equivalent billing hookup</p>
                </div>
              </div>
            </div>
          </section>
        </MagicCard>
      </div>
    </section>
  );
}
