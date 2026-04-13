"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Coins, ImageIcon, Search, Wallet } from "lucide-react";
import { useBrowserAuthReady } from "@/hooks/use-browser-auth-ready";
import { authFetch } from "@/lib/auth-fetch";
import { cn } from "@/lib/utils";

type CreditSummary = {
  balance: number;
  dailyGrantAmount: number;
  lastDailyGrantDate: string | null;
};

type CreditLedgerEntry = {
  id: string;
  amount: number;
  direction: "grant" | "debit" | "refund";
  reason: string;
  modelName: string | null;
  promptMode: string | null;
  projectId: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
};

const pricingRows = [
  { mode: "Auto", model: "Flash Lite", credits: "2-3", note: "cheap text pass" },
  { mode: "Auto", model: "Pro", credits: "7+", note: "heavier reasoning" },
  { mode: "Create Image", model: "Flash Image", credits: "18+", note: "base + image model" },
  { mode: "Create Image", model: "Imagen 4", credits: "22+", note: "premium image output" },
  { mode: "Deep Research", model: "Pro", credits: "26+", note: "expensive by design" },
];

function formatReason(entry: CreditLedgerEntry) {
  if (entry.reason === "daily_grant") return "Daily grant";
  if (entry.reason.startsWith("generation_image")) return "Image generation";
  if (entry.reason.startsWith("generation_text")) return "Text generation";
  return entry.reason.replaceAll("_", " ");
}

export default function CreditsPage() {
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [ledger, setLedger] = useState<CreditLedgerEntry[]>([]);
  const isBrowserAuthReady = useBrowserAuthReady();

  useEffect(() => {
    if (!isBrowserAuthReady) {
      return;
    }

    let cancelled = false;

    async function hydrate() {
      const response = await authFetch("/api/credits", { cache: "no-store" });
      const payload = (await response.json()) as
        | { ok: true; summary: CreditSummary; ledger: CreditLedgerEntry[] }
        | { ok: false };

      if (!cancelled && payload.ok) {
        setSummary(payload.summary);
        setLedger(payload.ledger);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [isBrowserAuthReady]);

  const recentDebits = useMemo(
    () => ledger.filter((entry) => entry.direction === "debit").slice(0, 3).reduce((sum, entry) => sum + entry.amount, 0),
    [ledger],
  );

  return (
    <section className="min-h-full rounded-[24px] border border-neutral-200 bg-neutral-50 p-8">
      <div className="flex flex-col gap-6">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Credits</p>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">Credit control center</h1>
          <p className="max-w-2xl text-sm leading-6 text-neutral-600">
            豈取律 500 繧ｯ繝ｬ繧ｸ繝・ヨ繧帝・繧狗┌譁咎°逕ｨ縺ｮ隕九∴繧句喧縺ｧ縺吶ゆｻ翫・隱ｲ驥第悴謗･邯壹ょ・縺ｫ谿矩ｫ倥∵ｶ郁ｲｻ縲∵侭驥第─縺縺代″繧後＞縺ｫ蜃ｺ縺励∪縺吶・
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr_0.9fr]">
          <section className="rounded-[20px] border border-neutral-200 bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                  <Wallet className="size-3.5" />
                  Live balance
                </div>
                <div>
                  <p className="text-5xl font-semibold tracking-tight text-neutral-950">{summary?.balance ?? "--"}</p>
                  <p className="mt-2 text-sm text-neutral-500">Available credits right now</p>
                </div>
              </div>
              <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Daily grant</p>
                <p className="mt-2 text-2xl font-semibold text-neutral-900">{summary?.dailyGrantAmount ?? 500}</p>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Last refill</p>
                <p className="mt-2 text-sm font-medium text-neutral-900">{summary?.lastDailyGrantDate ?? "--"}</p>
              </div>
              <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Recent debit</p>
                <p className="mt-2 text-sm font-medium text-neutral-900">{recentDebits} credits</p>
              </div>
            </div>
          </section>

          <section className="rounded-[20px] border border-neutral-200 bg-white p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-600">
              <Coins className="size-3.5" />
              Rules
            </div>
            <div className="mt-5 space-y-3 text-sm text-neutral-600">
              <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-3">
                Daily grant runs once per user, per calendar day.
              </div>
              <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-3">
                Generation debits first, then refunds on failure.
              </div>
              <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-3">
                Cost = mode base + model cost + small attachment surcharge.
              </div>
            </div>
          </section>

          <section className="rounded-[20px] border border-neutral-200 bg-white p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-neutral-400">Hot paths</p>
            <div className="mt-5 space-y-4">
              <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                  <Search className="size-4" />
                  Auto
                </div>
                <p className="mt-2 text-sm text-neutral-600">Cheap default path for normal chat.</p>
              </div>
              <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                  <ImageIcon className="size-4" />
                  Create Image
                </div>
                <p className="mt-2 text-sm text-neutral-600">Expensive path. Image models chew credits faster.</p>
              </div>
            </div>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[20px] border border-neutral-200 bg-white p-6">
            <div className="mb-5">
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-400">Pricing table</p>
              <h2 className="mt-2 text-xl font-semibold text-neutral-950">Estimated credit cost</h2>
            </div>
            <div className="space-y-3">
              {pricingRows.map((row) => (
                <div key={`${row.mode}-${row.model}`} className="grid grid-cols-[1fr_auto] gap-4 rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-3">
                  <div>
                    <p className="font-medium text-neutral-900">
                      {row.mode} ﾂｷ {row.model}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">{row.note}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-neutral-950">{row.credits}</p>
                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-400">credits</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[20px] border border-neutral-200 bg-white p-6">
            <div className="mb-5">
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-400">Recent activity</p>
              <h2 className="mt-2 text-xl font-semibold text-neutral-950">Ledger</h2>
            </div>
            <div className="space-y-3">
              {ledger.length > 0 ? (
                ledger.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[18px] border border-neutral-200 bg-neutral-50 px-4 py-3">
                    <div
                      className={cn(
                        "flex size-10 items-center justify-center rounded-full",
                        entry.direction === "grant"
                          ? "bg-emerald-100 text-emerald-700"
                          : entry.direction === "refund"
                            ? "bg-sky-100 text-sky-700"
                            : "bg-rose-100 text-rose-700",
                      )}
                    >
                      {entry.direction === "grant" || entry.direction === "refund" ? (
                        <ArrowDown className="size-4" />
                      ) : (
                        <ArrowUp className="size-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-900">{formatReason(entry)}</p>
                      <p className="truncate text-sm text-neutral-500">
                        {entry.modelName ?? "system"} {entry.promptMode ? `ﾂｷ ${entry.promptMode}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          "font-semibold",
                          entry.direction === "grant"
                            ? "text-emerald-700"
                            : entry.direction === "refund"
                              ? "text-sky-700"
                              : "text-rose-700",
                        )}
                      >
                        {entry.direction === "debit" ? "-" : "+"}
                        {entry.amount}
                      </p>
                      <p className="text-xs text-neutral-400">{new Date(entry.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-sm text-neutral-500">
                  No ledger activity yet.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
