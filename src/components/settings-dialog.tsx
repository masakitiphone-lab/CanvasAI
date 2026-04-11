"use client";

import { X, Settings2, Monitor, Moon, Sun, Bot, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserSettings, type UserSettings } from "@/hooks/use-user-settings";
import { TEXT_MODEL_OPTIONS, IMAGE_MODEL_OPTIONS } from "@/lib/model-options";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type SettingsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
};

export function SettingsDialog({ isOpen, onClose, userId }: SettingsDialogProps) {
  const { settings, updateSettings } = useUserSettings(userId);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/20 bg-white/90 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-neutral-100 bg-white/50 px-8 py-6">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-neutral-900 text-white shadow-lg">
                  <Settings2 className="size-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Settings</h2>
                  <p className="text-sm text-neutral-500">Manage your workspace preferences</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="size-10 rounded-full hover:bg-neutral-100"
              >
                <X className="size-5" />
              </Button>
            </div>

            <div className="grid grid-cols-[200px_1fr] h-[500px]">
              <div className="border-right border-neutral-100 bg-neutral-50/30 p-4">
                <nav className="flex flex-col gap-1">
                  <button className="flex items-center gap-3 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold shadow-xs ring-1 ring-neutral-200">
                    <Bot className="size-4" />
                    AI Models
                  </button>
                  <button className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-neutral-500 hover:bg-white/50 hover:text-neutral-900 transition-colors">
                    <Monitor className="size-4" />
                    Appearance
                  </button>
                </nav>
              </div>

              <div className="overflow-y-auto p-8">
                <section className="space-y-8">
                  {/* Text Model Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-purple-500" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400">Default Text Model</h3>
                    </div>
                    <div className="grid gap-2">
                      {TEXT_MODEL_OPTIONS.map((model) => (
                        <button
                          key={model.value}
                          onClick={() => updateSettings({ defaultTextModel: model.value })}
                          className={cn(
                            "flex flex-col gap-0.5 rounded-2xl border p-4 text-left transition-all duration-200",
                            settings.defaultTextModel === model.value
                              ? "border-neutral-900 bg-neutral-900 text-white shadow-md"
                              : "border-neutral-100 bg-white hover:border-neutral-300 hover:shadow-xs"
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

                  {/* Image Model Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-amber-500" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400">Default Image Model</h3>
                    </div>
                    <div className="grid gap-2">
                      {IMAGE_MODEL_OPTIONS.map((model) => (
                        <button
                          key={model.value}
                          onClick={() => updateSettings({ defaultImageModel: model.value })}
                          className={cn(
                            "flex flex-col gap-0.5 rounded-2xl border p-4 text-left transition-all duration-200",
                            settings.defaultImageModel === model.value
                              ? "border-neutral-900 bg-neutral-900 text-white shadow-md"
                              : "border-neutral-100 bg-white hover:border-neutral-300 hover:shadow-xs"
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
                </section>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/50 px-8 py-6">
              <span className="text-xs text-neutral-400">Settings are saved automatically to your device</span>
              <Button onClick={onClose} className="rounded-full bg-neutral-900 hover:bg-neutral-800">
                Done
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
