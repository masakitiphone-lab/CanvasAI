"use client";

import { Bot, Monitor, Sparkles, Settings2 } from "lucide-react";
import { useUserSettings } from "@/hooks/use-user-settings";
import { useBrowserAuthReady } from "@/hooks/use-browser-auth-ready";
import { authFetch } from "@/lib/auth-fetch";
import { TEXT_MODEL_OPTIONS, IMAGE_MODEL_OPTIONS } from "@/lib/model-options";
import { cn } from "@/lib/utils";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { MagicCard } from "@/components/ui/magic-card";
import { SparklesText } from "@/components/ui/sparkles-text";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const isBrowserAuthReady = useBrowserAuthReady();
  
  useEffect(() => {
    if (!isBrowserAuthReady) {
      return;
    }

    // We need the userId from the session to load settings
    const fetchUser = async () => {
      const response = await authFetch("/api/auth/session", { cache: "no-store" });
      const data = await response.json();
      if (data.user?.id) setUserId(data.user.id);
    };
    void fetchUser();
  }, [isBrowserAuthReady]);

  const { settings, updateSettings } = useUserSettings(userId);

  return (
    <section className="relative min-h-full overflow-hidden rounded-[32px] border border-neutral-200/70 bg-[linear-gradient(180deg,#fffdf9_0%,#f6f4ef_100%)] p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]">
      <AnimatedGridPattern
        width={40}
        height={40}
        x={-1}
        y={-1}
        className="absolute inset-0 h-full w-full fill-neutral-300/40 stroke-neutral-300/40 [mask-image:radial-gradient(ellipse_at_top,white,transparent_72%)]"
      />

      <div className="relative z-10 flex flex-col gap-8">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">Preferences</p>
          <SparklesText className="text-4xl font-semibold tracking-tight text-neutral-950" sparklesCount={5}>
            Workspace Settings
          </SparklesText>
          <p className="max-w-2xl text-sm leading-6 text-neutral-600">
            デフォルトモデルや外観の設定をカスタマイズして、あなた専用の作業環境を構築できます。
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <aside className="space-y-1">
            <button className="flex w-full items-center gap-3 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold shadow-xs ring-1 ring-neutral-200">
              <Bot className="size-4" />
              AI Models
            </button>
            <button className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-neutral-500 hover:bg-white/50 hover:text-neutral-900 transition-colors">
              <Monitor className="size-4" />
              Appearance
            </button>
          </aside>

          <div className="space-y-10">
            <MagicCard className="rounded-[28px]">
              <div className="space-y-6 bg-white p-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-purple-500" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400">Default Text Model</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2">
                    {TEXT_MODEL_OPTIONS.map((model) => (
                      <button
                        key={model.value}
                        onClick={() => updateSettings({ defaultTextModel: model.value })}
                        className={cn(
                          "flex flex-col gap-1 rounded-2xl border p-4 text-left transition-all duration-200",
                          settings.defaultTextModel === model.value
                            ? "border-neutral-900 bg-neutral-900 text-white shadow-lg"
                            : "border-neutral-100 bg-neutral-50/50 hover:border-neutral-300 hover:bg-white"
                        )}
                      >
                        <span className="text-sm font-bold">{model.label}</span>
                        <span className={cn(
                          "text-xs opacity-70",
                          settings.defaultTextModel === model.value ? "text-white" : "text-neutral-500"
                        )}>
                          {model.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-amber-500" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400">Default Image Model</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2">
                    {IMAGE_MODEL_OPTIONS.map((model) => (
                      <button
                        key={model.value}
                        onClick={() => updateSettings({ defaultImageModel: model.value })}
                        className={cn(
                          "flex flex-col gap-1 rounded-2xl border p-4 text-left transition-all duration-200",
                          settings.defaultImageModel === model.value
                            ? "border-neutral-900 bg-neutral-900 text-white shadow-lg"
                            : "border-neutral-100 bg-neutral-50/50 hover:border-neutral-300 hover:bg-white"
                        )}
                      >
                        <span className="text-sm font-bold">{model.label}</span>
                        <span className={cn(
                          "text-xs opacity-70",
                          settings.defaultImageModel === model.value ? "text-white" : "text-neutral-500"
                        )}>
                          {model.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </MagicCard>
          </div>
        </div>
      </div>
    </section>
  );
}
