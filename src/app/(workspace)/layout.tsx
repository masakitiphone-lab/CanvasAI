import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/supabase-server";

function getUserAvatarUrl(user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>) {
  const metadata = user.user_metadata ?? {};
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const firstIdentity = identities.find((identity) => identity.provider === "google") ?? identities[0];
  const identityData =
    firstIdentity && typeof firstIdentity.identity_data === "object" && firstIdentity.identity_data !== null
      ? firstIdentity.identity_data
      : null;

  return (
    metadata.avatar_url ??
    metadata.picture ??
    (typeof identityData?.avatar_url === "string" ? identityData.avatar_url : null) ??
    (typeof identityData?.picture === "string" ? identityData.picture : null) ??
    null
  );
}

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell
      userId={user.id}
      userName={user.user_metadata.full_name ?? user.user_metadata.name ?? user.email ?? "CanvasAI User"}
      userAvatarUrl={getUserAvatarUrl(user)}
    >
      {children}
    </AppShell>
  );
}
