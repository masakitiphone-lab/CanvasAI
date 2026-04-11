import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/supabase-server";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell
      userId={user.id}
      userName={user.user_metadata.full_name ?? user.user_metadata.name ?? user.email ?? "CanvasAI User"}
      userAvatarUrl={user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null}
    >
      {children}
    </AppShell>
  );
}
