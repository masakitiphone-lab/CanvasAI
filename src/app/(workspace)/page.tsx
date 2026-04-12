import { FlowCanvas } from "@/components/flow-canvas";
import { getSessionUser } from "@/lib/supabase-server";

type WorkspacePageProps = {
  searchParams?: Promise<{
    canvas?: string;
  }>;
};

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const user = await getSessionUser();
  const params = await searchParams;
  return <FlowCanvas userId={user?.id} initialProjectId={params?.canvas?.trim() || undefined} />;
}
