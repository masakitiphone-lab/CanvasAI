"use client";

import { useEffect, useState } from "react";
import type { ConversationModelName } from "@/lib/canvas-types";

const SETTINGS_KEY_PREFIX = "canvasai-settings-";

export type UserSettings = {
  defaultTextModel: string;
  defaultImageModel: string;
  theme: "light" | "dark" | "system";
};

const DEFAULT_SETTINGS: UserSettings = {
  defaultTextModel: "gemini-3.1-flash",
  defaultImageModel: "gemini-3.1-flash-image",
  theme: "light",
};

export function useUserSettings(userId: string | null) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;

    try {
      const stored = localStorage.getItem(`${SETTINGS_KEY_PREFIX}${userId}`);
      if (stored) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
    setIsLoaded(true);
  }, [userId]);

  const updateSettings = (updates: Partial<UserSettings>) => {
    if (!userId) return;

    const newSettings = { ...settings, ...updates };
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
