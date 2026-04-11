import { getSupabaseServerClient } from "@/lib/supabase-server";

const projectsCache = new Map<string, ProjectSummary[]>();
const isProduction = () => process.env.NODE_ENV === "production";

type ProjectRow = {
  id: string;
  owner_user_id: string;
  name: string;
  plan_key: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSummary = {
  id: string;
  title: string;
  planKey: string;
  createdAt: string;
  updatedAt: string;
};

function toProjectSummary(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    title: row.name,
    planKey: row.plan_key ?? "free",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Lists projects for a specific user, using cache if available.
 */
export async function listProjectsForUser(userId: string): Promise<ProjectSummary[]> {
  // Return cache if exists for instant UI
  if (projectsCache.has(userId)) {
    return projectsCache.get(userId)!;
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) return [];

  try {
    const result = await supabase
      .from("projects")
      .select("id, owner_user_id, name, plan_key, created_at, updated_at")
      .eq("owner_user_id", userId)
      .order("updated_at", { ascending: false });

    if (result.error) throw result.error;

    const projects = (result.data as ProjectRow[]).map(toProjectSummary);
    projectsCache.set(userId, projects);
    return projects;
  } catch (err) {
    console.error("Failed to list projects", err);
    return [];
  }
}

export async function getProjectForUser(userId: string, projectId: string): Promise<ProjectSummary | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;

  try {
    const result = await supabase
      .from("projects")
      .select("id, owner_user_id, name, plan_key, created_at, updated_at")
      .eq("id", projectId)
      .eq("owner_user_id", userId)
      .maybeSingle();

    if (result.error) throw result.error;

    return result.data ? toProjectSummary(result.data as ProjectRow) : null;
  } catch (err) {
    console.error("Failed to get project", err);
    return null;
  }
}

export async function createProjectForUser(params: {
  userId: string;
  title: string;
  projectId?: string;
  planKey?: string;
}) {
  const projectId = params.projectId ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const planKey = params.planKey ?? "free";
  
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;

  try {
    const query = params.projectId 
      ? supabase.from("projects").upsert({
          id: projectId,
          owner_user_id: params.userId,
          name: params.title,
          plan_key: planKey,
          updated_at: now,
        })
      : supabase.from("projects").insert({
          id: projectId,
          owner_user_id: params.userId,
          name: params.title,
          plan_key: planKey,
          created_at: now,
          updated_at: now,
        });

    const { data, error } = await query
      .select("id, owner_user_id, name, plan_key, created_at, updated_at")
      .single();

    if (error) {
      console.error("[ProjectStore] Create/Upsert failed:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        userId: params.userId,
        projectId
      });
      throw error;
    }

    // Invalidate list cache
    projectsCache.delete(params.userId);

    return toProjectSummary(data as ProjectRow);
  } catch (err) {
    if (isProduction()) {
      // In production, log fully to server console
      console.error("[ProjectStore] Critical error creating project:", err);
    }
    return null;
  }
}

export async function deleteProjectForUser(userId: string, projectId: string) {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("owner_user_id", userId);
    
    if (error) throw error;
    
    // Invalidate list cache
    projectsCache.delete(userId);
  } catch (err) {
    console.error("Failed to delete project", err);
  }
}

export async function touchProjectForUser(params: {
  userId: string;
  projectId: string;
  title?: string;
}) {
  const current = await getProjectForUser(params.userId, params.projectId);

  if (!current) {
    return createProjectForUser({
      userId: params.userId,
      projectId: params.projectId,
      title: params.title ?? "Untitled canvas",
    });
  }

  return createProjectForUser({
    userId: params.userId,
    projectId: params.projectId,
    title: params.title ?? current.title,
    planKey: current.planKey,
  });
}
