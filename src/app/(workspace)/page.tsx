import { FlowCanvas } from "@/components/flow-canvas";
import { getSessionUser } from "@/lib/supabase-server";

export default async function WorkspacePage() {
  const user = await getSessionUser();
  return <FlowCanvas userId={user?.id} />;
}
