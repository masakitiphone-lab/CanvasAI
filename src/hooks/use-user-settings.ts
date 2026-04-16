"use client";

import { startTransition, useEffect, useState } from "react";
import { normalizeModelName } from "@/lib/model-options";

const SETTINGS_KEY_PREFIX = "canvasai-settings-";

export type UserSettings = {
  defaultTextModel: string;
  defaultImageModel: string;
  theme: "light" | "dark" | "system";
};

const DEFAULT_SETTINGS: UserSettings = {
  defaultTextModel: "gemini-3-flash-preview",
  defaultImageModel: "gemini-3.1-flash-image-preview",
  theme: "light",
};

function normalizeSettings(settings: UserSettings): UserSettings {
  return {
    ...settings,
    defaultTextModel: normalizeModelName(settings.defaultTextModel, "auto") as string,
    defaultImageModel: normalizeModelName(settings.defaultImageModel, "image-create") as string,
  };
}

export function useUserSettings(userId: string | null) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      startTransition(() => {
        setSettings(DEFAULT_SETTINGS);
        setIsLoaded(true);
      });
      return;
    }

    let nextSettings = DEFAULT_SETTINGS;
    try {
      const stored = localStorage.getItem(`${SETTINGS_KEY_PREFIX}${userId}`);
      if (stored) {
        nextSettings = normalizeSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }

    startTransition(() => {
      setSettings(nextSettings);
      setIsLoaded(true);
    });
  }, [userId]);

  const updateSettings = (updates: Partial<UserSettings>) => {
    if (!userId) return;

    const newSettings = normalizeSettings({ ...settings, ...updates });
    setSettings(newSettings);
    try {
      localStorage.setItem(`${SETTINGS_KEY_PREFIX}${userId}`, JSON.stringify(newSettings));
      // Notify other components (like FlowCanvas) if needed
      window.dispatchEvent(new CustomEvent("canvasai:settings-updated", { detail: newSettings }));
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  };

  return { settings, updateSettings, isLoaded };
}
