"use client";

import { Bot, Monitor } from "lucide-react";
import { useUserSettings } from "@/hooks/use-user-settings";
import { useBrowserAuthReady } from "@/hooks/use-browser-auth-ready";
import { authFetch } from "@/lib/auth-fetch";
import { TEXT_MODEL_OPTIONS, IMAGE_MODEL_OPTIONS } from "@/lib/model-options";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const isBrowserAuthReady = useBrowserAuthReady();

  useEffect(() => {
    if (!isBrowserAuthReady) {
      return;
    }

    const fetchUser = async () => {
      const response = await authFetch("/api/auth/session", { cache: "no-store" });
      const data = await response.json();
      if (data.user?.id) setUserId(data.user.id);
    };

    void fetchUser();
  }, [isBrowserAuthReady]);

  const { settings, updateSettings } = useUserSettings(userId);

  return (
    <section className="min-h-full rounded-[24px] border border-neutral-200 bg-neutral-50 p-8">
      <div className="flex flex-col gap-8">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Preferences</p>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">Workspace settings</h1>
          <p className="max-w-2xl text-sm leading-6 text-neutral-600">
            繝・ヵ繧ｩ繝ｫ繝医Δ繝・Ν繧・､冶ｦｳ縺ｮ險ｭ螳壹ｒ繧ｫ繧ｹ繧ｿ繝槭う繧ｺ縺励※縲√≠縺ｪ縺溷ｰら畑縺ｮ菴懈･ｭ迺ｰ蠅・ｒ讒狗ｯ峨〒縺阪∪縺吶・
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <aside className="space-y-1">
            <button className="flex w-full items-center gap-3 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold shadow-xs ring-1 ring-neutral-200">
              <Bot className="size-4" />
              AI Models
            </button>
            <button className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-neutral-500">
              <Monitor className="size-4" />
              Appearance
            </button>
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
          </div>
        </div>
      </div>
    </section>
  );
}
