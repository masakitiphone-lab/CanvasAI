import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/supabase-server";

function getUserAvatarUrl(user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>) {
  const metadata = user.user_metadata ?? {};
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const identityDataList = identities
    .map((identity) =>
      typeof identity.identity_data === "object" && identity.identity_data !== null ? identity.identity_data : null,
    )
    .filter((identityData): identityData is Record<string, unknown> => identityData !== null);

  const avatarCandidates = [
    metadata.avatar_url,
    metadata.picture,
    metadata.photo_url,
    metadata.profile_image,
    ...identityDataList.flatMap((identityData) => [
      identityData.avatar_url,
      identityData.picture,
      identityData.photo_url,
      identityData.profile_image,
    ]),
  ];

  const foundAvatar = avatarCandidates.find((value): value is string => typeof value === "string" && value.trim().length > 0);

  if (foundAvatar) {
    return foundAvatar;
  }

  if (user.email) {
    const emailHash = Buffer.from(user.email.toLowerCase()).toString("base64").replace(/=/g, "");
    return `https://www.gravatar.com/avatar/${emailHash}?d=mp&s=200`;
  }

  return null;
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
