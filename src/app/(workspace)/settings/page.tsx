"use client";

import { Bot, Coins, Monitor } from "lucide-react";
import { useUserSettings } from "@/hooks/use-user-settings";
import { useBrowserAuthReady } from "@/hooks/use-browser-auth-ready";
import { authFetch } from "@/lib/auth-fetch";
import { TEXT_MODEL_OPTIONS, IMAGE_MODEL_OPTIONS } from "@/lib/model-options";
import { SETTINGS_COPY } from "@/lib/workspace-copy";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

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

function formatReason(entry: CreditLedgerEntry) {
  if (entry.reason === "daily_grant") return "毎日の付与";
  if (entry.reason.startsWith("generation_image")) return "画像生成";
  if (entry.reason.startsWith("generation_text")) return "テキスト生成";
  return entry.reason.replaceAll("_", " ");
}

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [ledger, setLedger] = useState<CreditLedgerEntry[]>([]);
  const isBrowserAuthReady = useBrowserAuthReady();

  useEffect(() => {
    if (!isBrowserAuthReady) {
      return;
    }

    let cancelled = false;

    async function hydrate() {
      const [sessionResponse, creditResponse] = await Promise.all([
        authFetch("/api/auth/session", { cache: "no-store" }),
        authFetch("/api/credits", { cache: "no-store" }),
      ]);

      const sessionData = await sessionResponse.json();
      const creditData = (await creditResponse.json()) as
        | { ok: true; summary: CreditSummary; ledger: CreditLedgerEntry[] }
        | { ok: false };

      if (cancelled) {
        return;
      }

      if (sessionData.user?.id) {
        setUserId(sessionData.user.id);
      }

      if (creditData.ok) {
        setSummary(creditData.summary);
        setLedger(creditData.ledger);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [isBrowserAuthReady]);

  const { settings, updateSettings } = useUserSettings(userId);

  const recentDebits = useMemo(
    () => ledger.filter((entry) => entry.direction === "debit").slice(0, 3).reduce((sum, entry) => sum + entry.amount, 0),
    [ledger],
  );

  return (
    <section className="min-h-full rounded-[24px] border border-neutral-200 bg-neutral-50 p-8">
      <div className="flex flex-col gap-8">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Preferences</p>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">Workspace settings</h1>
          <p className="max-w-3xl text-sm leading-6 text-neutral-600">{SETTINGS_COPY.description}</p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <aside className="space-y-1">
            <div className="flex w-full items-center gap-3 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold shadow-xs ring-1 ring-neutral-200">
              <Bot className="size-4" />
              AI Models
            </div>
            <div className="flex w-full items-center gap-3 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold shadow-xs ring-1 ring-neutral-200">
              <Coins className="size-4" />
              Credits
            </div>
            <div className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-neutral-500">
              <Monitor className="size-4" />
              Appearance
            </div>
          </aside>

          <div className="space-y-8">
            <section className="space-y-6 rounded-[20px] border border-neutral-200 bg-white p-8">
              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400">Default Text Model</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {TEXT_MODEL_OPTIONS.map((model) => (
                    <button
                      key={model.value}
                      onClick={() => updateSettings({ defaultTextModel: model.value })}
                      className={cn(
                        "flex flex-col gap-1 rounded-2xl border p-4 text-left",
                        settings.defaultTextModel === model.value
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 bg-neutral-50 text-neutral-900",
                      )}
                    >
                      <span className="text-sm font-bold">{model.label}</span>
                      <span
                        className={cn(
                          "text-xs opacity-70",
                          settings.defaultTextModel === model.value ? "text-white" : "text-neutral-500",
                        )}
                      >
                        {model.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400">Default Image Model</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {IMAGE_MODEL_OPTIONS.map((model) => (
                    <button
                      key={model.value}
                      onClick={() => updateSettings({ defaultImageModel: model.value })}
                      className={cn(
                        "flex flex-col gap-1 rounded-2xl border p-4 text-left",
                        settings.defaultImageModel === model.value
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 bg-neutral-50 text-neutral-900",
                      )}
                    >
                      <span className="text-sm font-bold">{model.label}</span>
                      <span
                        className={cn(
                          "text-xs opacity-70",
                          settings.defaultImageModel === model.value ? "text-white" : "text-neutral-500",
                        )}
                      >
                        {model.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-[20px] border border-neutral-200 bg-white p-8">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Credits</p>
                <h2 className="text-2xl font-semibold text-neutral-950">Balance and usage</h2>
                <p className="max-w-3xl text-sm leading-6 text-neutral-600">{SETTINGS_COPY.creditsDescription}</p>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Current balance</p>
                      <p className="mt-2 text-4xl font-semibold text-neutral-950">{summary?.balance ?? "--"}</p>
                    </div>
                    <div className="rounded-[16px] border border-neutral-200 bg-white px-4 py-3 text-right">
                      <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Daily grant</p>
                      <p className="mt-2 text-xl font-semibold text-neutral-950">{summary?.dailyGrantAmount ?? 500}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[16px] border border-neutral-200 bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Last refill</p>
                      <p className="mt-2 text-sm font-medium text-neutral-900">{summary?.lastDailyGrantDate ?? "--"}</p>
                    </div>
                    <div className="rounded-[16px] border border-neutral-200 bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Recent debit</p>
                      <p className="mt-2 text-sm font-medium text-neutral-900">{recentDebits} credits</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Estimated cost</p>
                  <div className="mt-4 space-y-3 text-sm text-neutral-600">
                    <div className="rounded-[16px] border border-neutral-200 bg-white px-4 py-3">
                      Auto × Flash Lite: 2-3 credits
                    </div>
                    <div className="rounded-[16px] border border-neutral-200 bg-white px-4 py-3">
                      Auto × Pro: 7+ credits
                    </div>
                    <div className="rounded-[16px] border border-neutral-200 bg-white px-4 py-3">
                      Image × Flash Image: 18+ credits
                    </div>
                    <div className="rounded-[16px] border border-neutral-200 bg-white px-4 py-3">
                      Deep Research × Pro: 26+ credits
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400">Recent ledger</h3>
                </div>
                {ledger.length > 0 ? (
                  ledger.slice(0, 8).map((entry) => (
                    <div key={entry.id} className="grid grid-cols-[1fr_auto] gap-4 rounded-[16px] border border-neutral-200 bg-neutral-50 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-neutral-900">{formatReason(entry)}</p>
                        <p className="truncate text-sm text-neutral-500">
                          {entry.modelName ?? "system"} {entry.promptMode ? `・ ${entry.promptMode}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-neutral-900">
                          {entry.direction === "debit" ? "-" : "+"}
                          {entry.amount}
                        </p>
                        <p className="text-xs text-neutral-400">{new Date(entry.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[16px] border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-sm text-neutral-500">
                    まだ履歴はありません。
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
