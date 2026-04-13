"use client";

import { Check, Coins, Crown, Rocket, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

const plans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    tag: "Default",
    icon: Coins,
    description: "辟｡譁吶〒蝗槭☆縺溘ａ縺ｮ讓呎ｺ匁棧縲ゆｻ翫・驕狗畑縺ｯ縺薙ｌ蜑肴署縺ｧ縺吶・",
    features: ["Daily 500 credits", "Canvas + attachments", "Standard queue", "Basic audit trail"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$24",
    tag: "Coming soon",
    icon: Crown,
    description: "驥阪＞繝｢繝・Ν繧偵ｂ縺｣縺ｨ髮代↓蜿ｩ縺阪◆縺・ｺｺ蜷代￠縲りｦ九◆逶ｮ縺縺大・縺ｫ螳梧・縲・",
    features: ["Larger daily credit pool", "Priority generation", "Faster refill options", "Advanced image quota"],
  },
  {
    id: "team",
    name: "Team",
    price: "$79",
    tag: "Coming soon",
    icon: Rocket,
    description: "隍・焚莠ｺ驕狗畑縺ｨ逶｣譟ｻ繧呈悽豌励〒繧・ｋ譎ゅ・蟶ｭ縲ゅ∪縺豎ｺ貂医・譛ｪ謗･邯壹・",
    features: ["Shared workspaces", "Central admin controls", "Expanded audit visibility", "Team-level billing later"],
  },
] as const;

export default function PlansPage() {
  return (
    <section className="min-h-full rounded-[24px] border border-neutral-200 bg-neutral-50 p-8">
      <div className="flex flex-col gap-6">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Plans</p>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">Pricing</h1>
          <p className="max-w-3xl text-sm leading-6 text-neutral-600">
            豎ｺ貂医・縺ｾ縺譛ｪ謗･邯壹ゅ〒繧ら判髱｢縺ｯ蜈医↓螳梧・縺輔○縺ｾ縺吶ら┌譁吶け繝ｬ繧ｸ繝・ヨ驕狗畑縺九ｉ縲√◎縺ｮ縺ｾ縺ｾ譛画侭繝励Λ繝ｳ縺ｸ諡｡蠑ｵ縺ｧ縺阪ｋ蠖｢縺ｫ縺励※縺ゅｊ縺ｾ縺吶・
          </p>
        </header>

        <div className="grid gap-4 xl:grid-cols-3">
          {plans.map((plan) => {
            const Icon = plan.icon;
            return (
              <article key={plan.id} className="h-full rounded-[20px] border border-neutral-200 bg-white p-7">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex size-12 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-100 text-neutral-900">
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-semibold text-neutral-950">{plan.name}</h2>
                      <p className="mt-2 text-sm leading-6 text-neutral-600">{plan.description}</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-500">
                    {plan.tag}
                  </span>
                </div>

                <div className="mt-8 flex items-end gap-2">
                  <p className="text-5xl font-semibold tracking-tight text-neutral-950">{plan.price}</p>
                  <span className="pb-1 text-sm text-neutral-500">/ month</span>
                </div>

                <div className="mt-8 space-y-3">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3 rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                      <div className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-neutral-900 text-white">
                        <Check className="size-3" />
                      </div>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-8">
                  <Button className="h-12 w-full rounded-2xl text-sm font-semibold">
                    {plan.id === "free" ? "Current free path" : "Billing hookup later"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>

        <section className="rounded-[20px] border border-neutral-200 bg-white px-7 py-8">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs uppercase tracking-[0.2em] text-neutral-600">
                <Shield className="size-3.5" />
                Rollout note
              </div>
              <h3 className="mt-4 text-2xl font-semibold text-neutral-950">Plan rollout</h3>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                隕九◆逶ｮ縺ｯ繧ゅ≧蜊∝・縲ゅ≠縺ｨ縺ｯ豎ｺ貂域磁邯壹∽ｸ企剞螟画峩 UI縲∬ｫ区ｱょｱ･豁ｴ繧偵▽縺ｪ縺偵ｌ縺ｰ蝠・畑縺｣縺ｽ縺輔・蜃ｺ縺ｾ縺吶・
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-400">Today</p>
                <p className="mt-2 text-lg font-medium text-neutral-950">Daily free-credit model is live</p>
              </div>
              <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-400">Later</p>
                <p className="mt-2 text-lg font-medium text-neutral-950">Stripe or equivalent billing hookup</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
