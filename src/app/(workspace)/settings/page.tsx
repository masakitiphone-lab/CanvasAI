"use client";

import { Bot, Check, ChevronDown, Coins, ImageIcon, Sparkles, type LucideIcon } from "lucide-react";
import { useUserSettings } from "@/hooks/use-user-settings";
import { useBrowserAuthReady } from "@/hooks/use-browser-auth-ready";
import { authFetch } from "@/lib/auth-fetch";
import { TEXT_MODEL_OPTIONS, IMAGE_MODEL_OPTIONS } from "@/lib/model-options";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";

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

type SectionId = "models" | "credits";

const SECTION_META: Array<{ id: SectionId; label: string; icon: LucideIcon }> = [
  { id: "models", label: "Models", icon: Bot },
  { id: "credits", label: "Credits", icon: Coins },
];

function ModelSelectCard({
  label,
  icon: Icon,
  value,
  options,
  onChange,
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  options: Array<{ value: string; label: string; description: string }>;
  onChange: (value: string) => void;
}) {
  const activeOption = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
            <Icon className="size-3.5" />
            <span>{label}</span>
          </div>
          <div className="mt-3">
            <p className="text-base font-semibold text-neutral-950">{activeOption.label}</p>
            <p className="mt-1 text-sm text-neutral-500">{activeOption.description}</p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 rounded-full border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-100"
            >
              Change
              <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[320px] rounded-2xl p-2">
            {options.map((option) => {
              const isActive = option.value === value;
              return (
                <DropdownMenuItem
                  key={option.value}
                  onSelect={() => onChange(option.value)}
                  className="flex items-start gap-3 rounded-xl px-3 py-3"
                >
                  <div
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                      isActive
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-300 bg-white text-transparent",
                    )}
                  >
                    <Check className="size-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-950">{option.label}</p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">{option.description}</p>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function formatReason(entry: CreditLedgerEntry) {
  if (entry.reason === "daily_grant") return "Daily grant";
  if (entry.reason.startsWith("generation_image")) return "Image generation";
  if (entry.reason.startsWith("generation_text")) return "Text generation";
  return entry.reason.replaceAll("_", " ");
}

function formatCreditDate(value: string | null) {
  if (!value) return "--";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [ledger, setLedger] = useState<CreditLedgerEntry[]>([]);
  const [activeSection, setActiveSection] = useState<SectionId>("models");
  const contentRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    models: null,
    credits: null,
  });
  const isBrowserAuthReady = useBrowserAuthReady();

  useEffect(() => {
    if (!isBrowserAuthReady) {
      return;
    }

    let cancelled = false;

    async function hydrate() {
      try {
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
      } catch (error) {
        console.error("Failed to load settings page data", error);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [isBrowserAuthReady]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (!visible) {
          return;
        }

        const sectionId = visible.target.getAttribute("data-section-id") as SectionId | null;
        if (sectionId) {
          setActiveSection(sectionId);
        }
      },
      {
        root: container,
        threshold: [0.35, 0.6],
        rootMargin: "-8% 0px -45% 0px",
      },
    );

    const sections = Object.values(sectionRefs.current).filter(Boolean) as HTMLElement[];
    sections.forEach((section) => observer.observe(section));

    return () => {
      observer.disconnect();
    };
  }, []);

  const { settings, updateSettings } = useUserSettings(userId);

  const recentDebits = useMemo(
    () =>
      ledger
        .filter((entry) => entry.direction === "debit")
        .slice(0, 3)
        .reduce((sum, entry) => sum + entry.amount, 0),
    [ledger],
  );

  const handleSectionSelect = (sectionId: SectionId) => {
    setActiveSection(sectionId);
    sectionRefs.current[sectionId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="h-full min-h-0 overflow-hidden rounded-[24px] border border-neutral-200 bg-neutral-50">
      <div className="flex h-full min-h-0 flex-col p-8">
        <header className="border-b border-neutral-200 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Settings</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">Workspace settings</h1>
        </header>

        <div className="mt-8 grid min-h-0 flex-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="min-h-0">
            <nav className="sticky top-0 space-y-2">
              {SECTION_META.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => handleSectionSelect(section.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
                      activeSection === section.id
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100",
                    )}
                  >
                    <Icon className="size-4" />
                    <span>{section.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <div ref={contentRef} className="min-h-0 overflow-y-auto pr-2">
            <div className="space-y-8">
              <section
                ref={(node) => {
                  sectionRefs.current.models = node;
                }}
                data-section-id="models"
                className="scroll-mt-6 space-y-6 rounded-[20px] border border-neutral-200 bg-white p-8"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Models</p>
                  <h2 className="mt-2 text-2xl font-semibold text-neutral-950">Default models</h2>
                  <p className="mt-2 text-sm text-neutral-500">
                    Pick the defaults for new chats. Existing nodes keep whatever model they already have.
                  </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <ModelSelectCard
                    label="Text model"
                    icon={Sparkles}
                    value={settings.defaultTextModel}
                    options={TEXT_MODEL_OPTIONS}
                    onChange={(value) => updateSettings({ defaultTextModel: value })}
                  />
                  <ModelSelectCard
                    label="Image model"
                    icon={ImageIcon}
                    value={settings.defaultImageModel}
                    options={IMAGE_MODEL_OPTIONS}
                    onChange={(value) => updateSettings({ defaultImageModel: value })}
                  />
                </div>
              </section>

              <section
                ref={(node) => {
                  sectionRefs.current.credits = node;
                }}
                data-section-id="credits"
                className="scroll-mt-6 rounded-[20px] border border-neutral-200 bg-white p-8"
              >
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Credits</p>
                  <h2 className="text-2xl font-semibold text-neutral-950">Balance and usage</h2>
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
                        <p className="mt-2 text-sm font-medium text-neutral-900">
                          {formatCreditDate(summary?.lastDailyGrantDate ?? null)}
                        </p>
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
                        Auto / Flash Lite: 2-3 credits
                      </div>
                      <div className="rounded-[16px] border border-neutral-200 bg-white px-4 py-3">
                        Auto / Pro: 7+ credits
                      </div>
                      <div className="rounded-[16px] border border-neutral-200 bg-white px-4 py-3">
                        Image / Nano Banana: 18+ credits
                      </div>
                      <div className="rounded-[16px] border border-neutral-200 bg-white px-4 py-3">
                        Deep Research / Pro: 26+ credits
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
                      <div
                        key={entry.id}
                        className="grid grid-cols-[1fr_auto] gap-4 rounded-[16px] border border-neutral-200 bg-neutral-50 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-neutral-900">{formatReason(entry)}</p>
                          <p className="truncate text-sm text-neutral-500">
                            {entry.modelName ?? "system"}
                            {entry.promptMode ? ` / ${entry.promptMode}` : ""}
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
                      No ledger entries yet.
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
