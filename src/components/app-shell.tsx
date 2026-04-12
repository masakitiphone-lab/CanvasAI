"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Coins,
  CreditCard,
  Edit2,
  LayoutGrid,
  Loader2,
  LogOut,
  MoreHorizontal,
  PlusSquare,
  Search,
  Settings,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SettingsDialog } from "@/components/settings-dialog";

type CanvasSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
  planKey?: string;
};

type CreditSummary = {
  balance: number;
  dailyGrantAmount: number;
  lastDailyGrantDate: string | null;
};

type CreditLedgerEntry = {
  id: string;
  amount: number;
  direction: "grant" | "debit" | "refund";
  reason: string;
  modelName: string | null;
  promptMode: string | null;
  projectId: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
};

const CACHE_KEY_PREFIX = "canvasai.projects";
const ACTIVE_CANVAS_KEY_PREFIX = "canvasai.active-canvas";

function getProjectCacheKey(userId: string) {
  return `${CACHE_KEY_PREFIX}.${userId}`;
}

function getActiveCanvasKey(userId: string) {
  return `${ACTIVE_CANVAS_KEY_PREFIX}.${userId}`;
}

function readProjectCache(userId: string): CanvasSummary[] {
  try {
    const raw = window.localStorage.getItem(getProjectCacheKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as CanvasSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeProjectCache(userId: string, canvases: CanvasSummary[]) {
  window.localStorage.setItem(getProjectCacheKey(userId), JSON.stringify(canvases));
}

function readActiveCanvas(userId: string) {
  try {
    return window.localStorage.getItem(getActiveCanvasKey(userId));
  } catch {
    return null;
  }
}

function writeActiveCanvas(userId: string, canvasId: string) {
  window.localStorage.setItem(getActiveCanvasKey(userId), canvasId);
}


function getUserInitials(userName: string) {
  const parts = userName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "AI";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

async function fetchProjects() {
  const response = await fetch("/api/projects", { cache: "no-store" });
  const payload = (await response.json()) as
    | { ok: true; projects: CanvasSummary[] }
    | { ok: false; error?: { message?: string } };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "Failed to load projects." : payload.error?.message ?? "Failed to load projects.");
  }

  return payload.projects;
}

async function createProject(title: string, id?: string) {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, projectId: id }),
  });
  const payload = (await response.json()) as
    | { ok: true; project: CanvasSummary }
    | { ok: false; error?: { message?: string } };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "Failed to create project." : payload.error?.message ?? "Failed to create project.");
  }

  return payload.project;
}

async function deleteProject(projectId: string) {
  const response = await fetch(`/api/projects?projectId=${encodeURIComponent(projectId)}`, { method: "DELETE" });
  const payload = (await response.json().catch(() => ({ ok: response.ok }))) as
    | { ok: true }
    | { ok: false; error?: { message?: string } };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "Failed to delete project." : payload.error?.message ?? "Failed to delete project.");
  }
}

async function fetchCredits() {
  const response = await fetch("/api/credits", { cache: "no-store" });
  const payload = (await response.json()) as
    | { ok: true; summary: CreditSummary; ledger: CreditLedgerEntry[] }
    | { ok: false; error?: { message?: string } };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "Failed to load credits." : payload.error?.message ?? "Failed to load credits.");
  }

  return payload.summary;
}

export function AppShell({
  children,
  userId,
  userName,
  userAvatarUrl,
}: {
  children: ReactNode;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
}) {
  const [search, setSearch] = useState("");
  const [canvases, setCanvases] = useState<CanvasSummary[]>([]);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [openCanvasMenuId, setOpenCanvasMenuId] = useState<string | null>(null);
  const [editingCanvasId, setEditingCanvasId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [creditSummary, setCreditSummary] = useState<CreditSummary | null>(null);
  const [avatarError, setAvatarError] = useState(false);

  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const cached = readProjectCache(userId);
    const cachedActiveCanvas = readActiveCanvas(userId);

    startTransition(() => {
      setCanvases(cached);
      setActiveCanvasId(
        cachedActiveCanvas && cached.some((canvas) => canvas.id === cachedActiveCanvas)
          ? cachedActiveCanvas
          : cached[0]?.id ?? null,
      );
    });

    let cancelled = false;

    async function hydrateProjects() {
      setIsLoadingProjects(true);
      try {
        const [projectList, credits] = await Promise.all([fetchProjects(), fetchCredits()]);
        let projects = projectList;
        setCreditSummary(credits);

        if (projects.length === 0) {
          const project = await createProject("Canvas 1");
          projects = [project];
        }

        if (cancelled) {
          return;
        }

        const nextActiveCanvasId =
          (cachedActiveCanvas && projects.some((canvas) => canvas.id === cachedActiveCanvas) ? cachedActiveCanvas : null) ??
          projects[0]?.id ??
          null;

        startTransition(() => {
          setCanvases(projects);
          setActiveCanvasId(nextActiveCanvasId);
        });
      } finally {
        if (!cancelled) {
          setIsLoadingProjects(false);
        }
      }
    }

    void hydrateProjects();

    const handleProjectUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ projectId?: string; title?: string }>;
      const projectId = customEvent.detail?.projectId;
      const title = customEvent.detail?.title?.trim();
      if (!projectId || !title) {
        return;
      }

      setCanvases((current) => {
        const index = current.findIndex((canvas) => canvas.id === projectId);
        if (index === -1) {
          // New project appearing (e.g. from auto-save)
          return [
            {
              id: projectId,
              title,
              updatedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              planKey: "free",
            },
            ...current,
          ];
        }
        return current.map((canvas) =>
          canvas.id === projectId
            ? {
                ...canvas,
                title,
                updatedAt: new Date().toISOString(),
              }
            : canvas,
        );
      });
    };

    window.addEventListener("canvas:project-updated", handleProjectUpdated as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener("canvas:project-updated", handleProjectUpdated as EventListener);
    };
  }, [userId]);

  useEffect(() => {
    const refreshCredits = () => {
      void fetchCredits()
        .then((summary) => setCreditSummary(summary))
        .catch(() => null);
    };

    window.addEventListener("credits:refresh", refreshCredits);
    return () => window.removeEventListener("credits:refresh", refreshCredits);
  }, []);

  useEffect(() => {
    writeProjectCache(userId, canvases);
  }, [canvases, userId]);

  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!userId) {
      setCanvases([]);
      return;
    }
    if (activeCanvasId) {
      writeActiveCanvas(userId, activeCanvasId);
    }

    const activeCanvas = canvases.find(c => c.id === activeCanvasId);
    window.dispatchEvent(new CustomEvent("canvas:switch-canvas", { 
      detail: { 
        canvasId: activeCanvasId,
        title: activeCanvas?.title
      } 
    }));
  }, [activeCanvasId, userId, canvases]);


  const filteredCanvases = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return canvases;
    return canvases.filter((canvas) => canvas.title.toLowerCase().includes(keyword));
  }, [canvases, search]);

  const handleSwitchCanvas = (canvasId: string | null) => {
    setActiveCanvasId(canvasId);
    if (pathname !== "/") {
      router.push("/");
    }
  };

  const [isCreatingCanvas, setIsCreatingCanvas] = useState(false);
  const handleCreateCanvas = () => {
    // Generate an ID and metadata optimistically to avoid waiting for Supabase
    const newId = crypto.randomUUID();
    const nextIndex = canvases.length + 1;
    const newCanvas: CanvasSummary = {
      id: newId,
      title: `Canvas ${nextIndex}`,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      planKey: "free",
    };

    // Update UI immediately
    setCanvases((current) => [newCanvas, ...current]);
    setActiveCanvasId(newId);

    // If we're not on the home page, go there
    if (pathname !== "/") {
      router.push("/");
    }

    // Fire and forget the DB creation in the background
    void createProject(newCanvas.title, newId).catch((err) => {
      console.warn("Background project creation failed, but auto-save may recover:", err);
    });
  };

  const handleDeleteCanvas = async (canvasId: string) => {
    const remainingCanvases = canvases.filter((canvas) => canvas.id !== canvasId);
    const nextActiveCanvasId = activeCanvasId === canvasId ? remainingCanvases[0]?.id ?? null : activeCanvasId;

    setCanvases(remainingCanvases);
    setOpenCanvasMenuId(null);
    setActiveCanvasId(nextActiveCanvasId);

    await deleteProject(canvasId).catch(() => null);

    if (remainingCanvases.length === 0) {
      const fallback = await createProject("Canvas 1");
      setCanvases([fallback]);
      setActiveCanvasId(fallback.id);
    }
  };

  const handleStartRename = (canvas: CanvasSummary) => {
    setEditingCanvasId(canvas.id);
    setEditingTitle(canvas.title);
    setOpenCanvasMenuId(null);
  };

  const handleRenameCanvas = async (canvasId: string) => {
    const title = editingTitle.trim();
    if (!title) return;

    setCanvases((current) => current.map((canvas) => (canvas.id === canvasId ? { ...canvas, title } : canvas)));
    setEditingCanvasId(null);

    try {
      const response = await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: canvasId, title }),
      });
      if (!response.ok) {
        throw new Error("Rename failed");
      }

      const payload = (await response.json()) as { ok?: boolean; project?: CanvasSummary };
      if (payload.ok && payload.project) {
        setCanvases((current) => current.map((canvas) => (canvas.id === canvasId ? payload.project! : canvas)));
      }
    } catch {
      // Keeping the optimistic title is fine for now.
    }
  };

  useEffect(() => {
    const handleWindowClick = () => setOpenCanvasMenuId(null);
    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <Link href="/" className="sidebar__brand-copy" onClick={() => handleSwitchCanvas(activeCanvasId)}>
            <div className="sidebar__brand-icon">
              <img src="/logo.png" alt="CanvasAI" className="size-full object-contain" />
            </div>
            <span>CanvasAI</span>
          </Link>
        </div>

        <div className="sidebar__nav">
          <Button 
            type="button" 
            variant="ghost" 
            className="sidebar__nav-item justify-start" 
            onClick={() => void handleCreateCanvas()}
            disabled={isCreatingCanvas}
          >
            {isCreatingCanvas ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PlusSquare className="size-4" />
            )}
            {isCreatingCanvas ? "Creating..." : "New canvas"}
          </Button>

          <Button asChild type="button" variant="ghost" className={cn("sidebar__nav-item justify-start", pathname === "/credits" && "sidebar__nav-item--active")}>
            <Link href="/credits">
              <Coins className="size-4" />
              Credits
            </Link>
          </Button>

          <Button asChild type="button" variant="ghost" className={cn("sidebar__nav-item justify-start", pathname === "/plans" && "sidebar__nav-item--active")}>
            <Link href="/plans">
              <CreditCard className="size-4" />
              Plans
            </Link>
          </Button>

          <Button asChild type="button" variant="ghost" className={cn("sidebar__nav-item justify-start", pathname === "/settings" && "sidebar__nav-item--active")}>
            <Link href="/settings">
              <Settings2 className="size-4" />
              Settings
            </Link>
          </Button>

          <label className="sidebar__search">
            <Search className="size-4 shrink-0 text-neutral-500" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              placeholder="Search canvas"
            />
          </label>
        </div>

        <div className="sidebar__list">
          <p className="sidebar__section-title">Canvas</p>
          <div className="sidebar__items">
            {isLoadingProjects && canvases.length === 0 ? (
              <div className="sidebar__empty">Loading canvas...</div>
            ) : filteredCanvases.length > 0 ? (
              filteredCanvases.map((canvas) => (
                <div
                  key={canvas.id}
                  className={`sidebar__chat-item ${activeCanvasId === canvas.id && pathname === "/" ? "sidebar__chat-item--active" : ""}`}
                >
                  <button type="button" className="sidebar__chat-button" onClick={() => handleSwitchCanvas(canvas.id)}>
                    <LayoutGrid className="size-4 shrink-0 text-neutral-500" />
                    {editingCanvasId === canvas.id ? (
                      <Input
                        autoFocus
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onBlur={() => void handleRenameCanvas(canvas.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void handleRenameCanvas(canvas.id);
                          if (event.key === "Escape") setEditingCanvasId(null);
                        }}
                        className="h-7 border-0 bg-white/50 px-1 py-0 shadow-none focus-within:ring-1"
                        onClick={(event) => event.stopPropagation()}
                      />
                    ) : <span className="min-w-0 truncate">{canvas.title}</span>}
                  </button>

                  <div className="sidebar__chat-menu">
                    <button
                      type="button"
                      className="sidebar__chat-menu-trigger"
                      aria-label={`Open menu for ${canvas.title}`}
                      aria-expanded={openCanvasMenuId === canvas.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenCanvasMenuId((current) => (current === canvas.id ? null : canvas.id));
                      }}
                    >
                      <MoreHorizontal className="size-4" />
                    </button>

                    {openCanvasMenuId === canvas.id ? (
                      <div className="sidebar__chat-menu-panel" onClick={(event) => event.stopPropagation()}>
                        <button type="button" className="sidebar__chat-menu-item" onClick={() => handleStartRename(canvas)}>
                          <Edit2 className="size-4" />
                          Rename
                        </button>
                        <button
                          type="button"
                          className="sidebar__chat-menu-item sidebar__chat-menu-item--danger"
                          onClick={() => void handleDeleteCanvas(canvas.id)}
                        >
                          <Trash2 className="size-4" />
                          Delete canvas
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="sidebar__empty">No canvas yet</div>
            )}
          </div>
        </div>

        <div className="sidebar__account">
          <div className="sidebar__account-avatar">
            {userAvatarUrl && !avatarError ? (
              <img
                src={userAvatarUrl}
                alt={userName}
                className="sidebar__account-avatar-image"
                draggable={false}
                onError={() => setAvatarError(true)}
              />
            ) : (
              getUserInitials(userName)
            )}
          </div>
          <div className="sidebar__account-copy">
            <strong>{userName}</strong>
            {creditSummary ? (
              <span className="sidebar__account-meta">
                {creditSummary.balance}/{creditSummary.dailyGrantAmount}
              </span>
            ) : null}
          </div>
          <Button asChild type="button" variant="ghost" size="icon" className="sidebar__account-action">
            <Link href="/auth/signout" aria-label="Sign out">
              <LogOut className="size-4" />
            </Link>
          </Button>
        </div>
      </aside>

      <div className="workspace">{children}</div>
    </div>
  );
}
