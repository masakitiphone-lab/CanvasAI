# CanvasAI Architecture Memory

This file stores long-lived technical assumptions that future AI work should read before implementing features.

Everything here is explicit on purpose. Hidden assumptions are how AI coding goes off the rails.

## Proposed Stack

- App framework: Next.js with App Router
- UI: React
- UI foundation: Tailwind CSS v4 + `shadcn/ui`
- Canvas engine: React Flow
- Markdown rendering: `react-markdown` + `remark-gfm`
- AI provider for MVP: Gemini `generateContent`

## Current Repository State

Step 8 attachment support is now initialized.

- Next.js App Router project exists in `src/app`.
- `/` is served by the `(workspace)` route group.
- `/login` is a separate placeholder route.
- React Flow is installed via `@xyflow/react`.
- Tailwind CSS v4 is installed.
- `shadcn/ui` base components are installed and usable from `src/components/ui`.
- `/` now renders a real React Flow canvas in local client state.
- Empty canvas right-click opens a minimal context menu.
- `New Chat` creates a root user node at the clicked flow position.
- Pan and zoom are enabled.
- User and AI nodes now have separate UI.
- Nodes are compact by default and expand on selection.
- Expanded nodes have capped height and internal scroll behavior.
- User nodes are editable locally.
- AI nodes are read-only locally.
- Mock status badges now exist for `generating`, `error`, `outdated`, and `orphan`.
- Parent-child edges are now visible.
- The current visual direction is intentionally a simple mind map built on React Flow, not a custom edge-heavy diagram system.
- The current visual direction is intentionally quiet and product-like: thin borders, fixed-width nodes, minimal shadows, and no exposed debug counters in the main workspace.
- ユーザー向け UI 文言は今後すべて日本語を基本にする。英語ラベルを増やさない。
- AI nodes now expose reply branching into child user nodes.
- User nodes now expose a generate action that creates an AI child immediately in `generating` state.
- AI nodes now expose a direct same-model regenerate action without a settings modal.
- New child nodes are inserted to the right using simple layout rules.
- Dragged nodes are marked pinned so later insertions do not try to rearrange them.
- Viewport follow is enabled when a newly inserted node appears outside the visible area.
- A local API route now proxies Gemini `generateContent`.
- The default Gemini model is currently `gemini-3-flash-preview`.
- AI nodes can now override the default Gemini model per node with `gemini-3-flash-preview`, `gemini-2.5-flash-lite`, or `gemini-2.5-pro`.
- `.env.example` documents the required `GEMINI_API_KEY`.
- Gemini requests are now built from the selected node's direct lineage only.
- A sibling branch exists in seeded data specifically to prove it is excluded from the request payload.
- AI node content is rendered with `react-markdown` and `remark-gfm`, with Grok-style presentation rules for headings, lists, blockquotes, code, tables, links, emphasis, and images.
- New user nodes can now be created with image, PDF, and URL attachments.
- Attachment metadata is persisted locally in `data/attachment-metadata.json`.
- Uploaded attachment files are persisted locally in `public/storage/attachments`.
- Attachment cards are rendered in expanded node views.
- Lineage payloads now include attachment metadata as future multimodal request hooks.
- Gemini requests now attach image binaries as `inlineData` parts and PDF binaries through the Gemini Files API.
- URL attachments are still sent as text references, because a raw URL is not a binary multimodal asset.
- Canvas nodes and edges now save through `/api/canvas`, with Supabase as the preferred backend and local JSON as the fallback.
- Double-clicking an AI node header now expands that node in place and smoothly moves the camera toward it; there is no separate response-detail window anymore.
- The left sidebar now acts as the chat navigator with `New chat`, `Search chats`, a root-chat list, and a bottom account block.
- The left sidebar now acts as a canvas navigator with `New canvas`, `Search canvas`, a canvas list, and a bottom account block.
- Canvas switching is keyed by `projectId`; selecting a different canvas should load that canvas's saved graph or show an empty workspace if nothing has been saved yet.
- The visible reply-branch handle lives on AI nodes and is intentionally offset away from the right resize zone so branching does not compete with resizing.
- The canvas background is now a faint gray line grid rather than a dotted paper texture.
- Editable prompt nodes now include a composer-style footer with a circular send action, a microphone placeholder, a node-level Gemini model selector, and a `+` tools menu.
- Prompt-footer controls should avoid browser-native form styling; the model selector is a custom pill menu, the send action is a black circular button, and attachment chips are removable with an inline `×`.
- AI node wrapper dimensions in React Flow and the visible AI card minimum width must stay aligned; if these constants drift apart, the visual card and the actual node hit area diverge and the canvas feels broken.
- Prompt attachments now use two presentation modes: rectangular removable chips for document-like items and square thumbs for image items.
- The selected user-node model should carry into the next AI generation request instead of always falling back to the global default model.
- The prompt `+` tools menu is the planned extension point for future image-generation, deep-research, web-search, and richer media-node workflows.
- A user prompt that has not produced an AI child yet should remain visually open as a draft composer even if selection moves elsewhere on the canvas.
- Image generation is now implemented directly on the Gemini API path, not deferred to Vertex-only infrastructure.
- The current image-generation route is `src/app/api/gemini/generate-image/route.ts`.
- The current image-generation model is `gemini-3.1-flash-image-preview`, matching the latest Google AI documentation guidance as the default all-around Gemini image model.
- Image generation uses `generateContent` with `generationConfig.responseModalities: ["IMAGE"]` and `generationConfig.imageConfig`.
- Generated image bytes are persisted through the same attachment storage layer as uploaded files so preview, download, and persistence all share one path.
- Image-generation inputs currently reuse prompt-node text plus any attached image files; non-image attachments are not injected into the image-generation request yet.
- The canvas now has a dedicated `image` node kind for generated image results. Keep image-preview behavior there instead of cramming generated images into plain AI text nodes.
- Prompt nodes enter image-generation mode by switching their active model to `gemini-3.1-flash-image-preview`. `Create image` is now a visible mode switch, not an immediate generate action.
- Image-generation UX should include three things from day one: inline preview inside the node, a larger preview surface on focus, and an explicit download action for the rendered asset.
- Selection rules are now explicit: `Shift + click` adds to the current node selection, `Ctrl/Cmd + left-drag` creates a box-selection region, and plain left-drag is reserved for normal canvas panning.
- Prompt and AI body text must remain mouse-selectable so users can highlight and copy content directly from inside a node.
- When a prompt node is in edit mode, clicking another node or the empty pane should immediately end that edit session.
- Gemini generation now includes an explicit Markdown-oriented `system_instruction` so the model stays closer to compact CommonMark/GFM output instead of relying on implicit formatting behavior.
- AI response cards should default wide enough to read roughly fifty characters across before the user needs to resize them manually.
- Authentication is not implemented yet.

## Route Structure

```txt
src/app/
  layout.tsx
  globals.css
  (workspace)/
    layout.tsx
    page.tsx
  login/
    page.tsx
src/components/
  app-shell.tsx
  canvas-placeholder.tsx
  conversation-node.tsx
  flow-canvas.tsx
  node-creation-panel.tsx
  ui/
src/lib/
  attachment-store.ts
  canvas-types.ts
  utils.ts
src/app/api/
  attachments/
    file/
      route.ts
    url/
      route.ts
  gemini/
    generate/
      route.ts
```

## Step 2 Implementation Notes

- The Step 2 canvas lives in `src/components/flow-canvas.tsx`.
- The canvas is a client component wrapped with `ReactFlowProvider`.
- Root user nodes are stored in local component state only.
- The right-click menu is intentionally limited to one action: `New Chat`.
- Root node placement uses `screenToFlowPosition` so the node appears where the user clicked on the pane.
- There is no backend sync, no AI node creation, and no attachment handling yet.

## Step 3 Implementation Notes

- The node type model lives in `src/lib/canvas-types.ts`.
- The reusable visual node component lives in `src/components/conversation-node.tsx`.
- The Step 3 canvas uses seeded local mock nodes so both user and AI node states are visible immediately.
- Selection state drives compact vs expanded display.
- User node editing updates local React Flow node state only.
- AI node content is presented as read-only text in a scrollable container.
- `shadcn/ui` components currently used in canvas UI include `button`, `card`, `badge`, `textarea`, `scroll-area`, and `separator`.

## Step 4 Implementation Notes

- Step 4 keeps React Flow as the single canvas library and pushes it toward a simple mind-map presentation instead of introducing a second mind-map-specific package.
- Edges use a plain `smoothstep` style with no custom interactive behavior.
- Root conversations are still created from empty-pane right click.
- The seeded mock graph now includes visible parent-child relationships.
- AI nodes expose a reply action that creates child user nodes.
- Initial seeded graph placement is aligned into a left-to-right tree shape using `@dagrejs/dagre`.
- Insert layout uses dagre-derived suggestions for new nodes only, then clamps into the visible area when needed and moves the viewport if the result would be off-screen.
- Manual drag marks a node as pinned. Current insert logic never reflows existing nodes, so manually adjusted branches stay put.

## UI Direction Memory

- Do not bring back the heavy black offset shadows. That looked like a rough wireframe, not a product.
- Keep node width fixed around `300px` unless a later requirement explicitly changes it.
- Keep information hierarchy obvious: title first, body second, metadata subdued.
- Keep only meaningful state badges visible in the node chrome.
- Do not expose raw node counts, lineage debug panes, or other developer metrics in the normal workspace UI.
- Keep the canvas visually closer to a calm mind map than to a graph debugger.
- Keep interactive UI on `shadcn/ui` primitives wherever possible.
- Default all visible product text to Japanese unless a requirement explicitly asks for English.
- Keep the main conversation chain visibly horizontal from left to right.
- Use `@dagrejs/dagre` for mind-map layout guidance with `rankdir: "LR"`, `rankSep: 160`, and `nodeSep: 80`.
- Keep root nodes slightly stronger than normal nodes with a quiet `#fafafa` surface and stronger border.
- Keep selected nodes visually obvious with a black `2px` border and `shadow-md`.

## Domain Model Draft

These types are initial draft shapes. Update them when real code is introduced.

```ts
export type ProjectId = string;
export type CanvasNodeId = string;
export type AttachmentId = string;

export type NodeKind = "user" | "ai";
export type NodeStatus = "idle" | "generating" | "error" | "outdated" | "orphan";
export type AttachmentKind = "image" | "pdf" | "url";

export interface Project {
  id: ProjectId;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasNodePosition {
  x: number;
  y: number;
}

export interface CanvasNodeModelConfig {
  provider: "gemini";
  model: "gemini-2.5-flash" | "gemini-2.5-flash-lite" | "gemini-2.5-pro";
}

export interface CanvasAttachment {
  id: AttachmentId;
  nodeId: CanvasNodeId;
  kind: AttachmentKind;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
  storagePath?: string;
  createdAt: string;
}

export interface CanvasNode {
  id: CanvasNodeId;
  projectId: ProjectId;
  parentId: CanvasNodeId | null;
  kind: NodeKind;
  content: string;
  preview: string;
  title: string;
  status: NodeStatus;
  isExpanded: boolean;
  position: CanvasNodePosition;
  isPositionPinned: boolean;
  attachments: CanvasAttachment[];
  modelConfig?: CanvasNodeModelConfig;
  createdAt: string;
  updatedAt: string;
}
```

## State Rules

- A project owns one infinite canvas.
- Nodes form trees through `parentId`.
- A root node has `parentId = null`.
- Multiple roots may exist in one project.
- `isPositionPinned = true` means manual movement should be preserved by later insert layout logic.
- `preview` is a display helper, not source of truth.
- `content` is the source of truth.
- `title` may be generated from content locally for compact node display.

## Outdated Propagation Rule

If a user node changes:

- Mark that node as current content.
- Mark every descendant as `outdated`.
- Do not silently regenerate descendants.
- Keep invalidation deterministic and inspectable.

## Database Storage Draft

No final database exists yet. Use this as the draft persistence contract.

Current MVP implementation note:

- The real database does not exist yet.
- Attachment metadata currently lives in the local JSON file `data/attachment-metadata.json`.
- Treat that file as a temporary stand-in for the future `node_attachments` table, not as a final architecture decision.

### `projects`

```ts
type ProjectRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};
```

### `canvas_nodes`

```ts
type CanvasNodeRow = {
  id: string;
  project_id: string;
  parent_id: string | null;
  kind: "user" | "ai";
  content: string;
  preview: string;
  title: string;
  status: "idle" | "generating" | "error" | "outdated" | "orphan";
  position_x: number;
  position_y: number;
  is_position_pinned: boolean;
  model_provider: "gemini" | null;
  model_name: string | null;
  created_at: string;
  updated_at: string;
};
```

### `node_attachments`

```ts
type NodeAttachmentRow = {
  id: string;
  node_id: string;
  kind: "image" | "pdf" | "url";
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  url: string | null;
  storage_path: string | null;
  created_at: string;
};
```

## Storage Rules

- Binary files are not stored directly in the main relational node table.
- File metadata goes in the database.
- Actual uploaded file content goes in storage.
- URL attachments store link metadata only and have no storage blob.
- Preferred MVP production backend: Supabase Postgres + Supabase Storage.
- Local fallback remains available for development when Supabase env vars are missing.
- Live project note: Supabase table persistence and Storage bucket provisioning have now been verified against a real hosted project.
- Live project note: the default `canvasai-mvp` project has been reset to an empty canvas so the app no longer opens with canned conversation content.

## Step 8 Implementation Notes

- Creation-time attachment UI lives in `src/components/node-creation-panel.tsx`.
- The panel opens from empty-canvas `New Chat` and from the AI-node reply action.
- Existing nodes do not support reattachment. That is deliberate.
- File uploads go through `src/app/api/attachments/file/route.ts`.
- URL attachments go through `src/app/api/attachments/url/route.ts`.
- Local persistence helpers live in `src/lib/attachment-store.ts`.
- Valid file uploads are restricted to image and PDF types.
- Invalid file uploads are rejected at the API route level.
- The current storage implementation is local-only and intended for MVP development, not production deployment.

## Persistence Notes

- Canvas persistence now lives behind `src/app/api/canvas/route.ts`.
- Server-side save/load logic lives in `src/lib/canvas-store.ts`.
- Supabase server access is centralized in `src/lib/supabase-server.ts`.
- When Supabase is configured, nodes are stored in Postgres tables and binary attachments are uploaded to a Storage bucket.
- When Supabase is not configured, the app falls back to `data/canvas-state.json` plus local filesystem attachments.
- Empty saved snapshots are ignored on load so the seeded canvas still appears instead of a blank workspace.
- The current production bucket name is `canvas-attachments`.

## API Contract Draft

The MVP should use a thin server-side API boundary. Exact file locations can change later, but the request/response shape should remain boring and inspectable.

### Generate AI Response

```ts
export interface GenerateNodeResponseRequest {
  projectId: string;
  targetNodeId: string;
  lineage: Array<{
    id: string;
    kind: "user" | "ai";
    content: string;
    attachments: Array<{
      id: string;
      kind: "image" | "pdf" | "url";
      url?: string;
      storagePath?: string;
      mimeType?: string;
      name: string;
    }>;
  }>;
  model: {
    provider: "gemini";
    name: string;
  };
}

export interface GenerateNodeResponseSuccess {
  ok: true;
  node: {
    id: string;
    content: string;
    status: "idle";
  };
}

export interface GenerateNodeResponseFailure {
  ok: false;
  node: {
    id: string;
    status: "error";
  };
  error: {
    message: string;
    code?: string;
  };
}
```

## Context Builder Rules

The context builder must:

- Start from the selected node.
- Walk parent links upward only.
- Stop at the root.
- Reverse order to oldest -> newest.
- Exclude siblings every time.
- Exclude unrelated roots every time.

Expected helper shape:

```ts
export function buildLineageContext(
  nodes: CanvasNode[],
  targetNodeId: string,
): CanvasNode[] {
  // explicit parent walk, no graph cleverness needed
}
```

## Gemini Calling Rules

- MVP endpoint: Gemini `generateContent`
- Not allowed for MVP: Interactions API
- Streaming is future scope only
- First successful implementation should use hardcoded model config
- Only connect Gemini after local graph behavior is stable
- Image attachments are sent as `inlineData` parts from the server route.
- PDF attachments are uploaded to the Gemini Files API and sent as `file_data` references.
- URL attachments remain prompt text references for now.

## Step 5 Implementation Notes

- The local API route lives at `src/app/api/gemini/generate/route.ts`.
- It calls Google's REST `generateContent` endpoint with `x-goog-api-key`.
- The old naive request path existed only briefly and is now superseded by lineage payloads.
- When a user triggers generation, the UI immediately creates an AI child node with `status: "generating"`.
- On success, the AI node content is filled and status returns to `idle`.
- On failure, the AI node remains in place and becomes `error`.
- If `GEMINI_API_KEY` is missing, generation fails deterministically and the AI node shows the failure text.
- The route now builds multimodal `parts` instead of collapsing everything into one text blob when binary attachments are present.

## Step 6 Implementation Notes

- Direct lineage building lives in `src/lib/build-lineage-context.ts`.
- The lineage builder walks `parentId` links upward from the selected node and reverses the result to oldest -> newest.
- The UI now sends `{ targetNodeId, lineage, model }` to `/api/gemini/generate`.
- The API route converts that lineage into an explicit prompt payload for Gemini `generateContent`.
- Sibling branches are excluded by construction because the builder never traverses sideways.
- Sibling exclusion is now verified by the seeded branch structure and code path, not by exposing a debug panel in the normal UI.

## Step 7 Implementation Notes

- Markdown rendering lives in `src/components/markdown-renderer.tsx`.
- AI nodes render Markdown only in expanded mode; compact mode still uses a plain text preview derived from the raw content string.
- The renderer intentionally uses `react-markdown` with `remark-gfm` only. No raw HTML rendering plugin is enabled.
- Seeded AI nodes include Markdown examples so browser verification can confirm tables, lists, quotes, links, and code blocks immediately.

## React Flow Behavior Memory

- Correction note: the old floating root/reply composer is no longer the primary creation flow. Keep it removed from normal canvas UX.
- Right-click empty pane opens context menu.
- `New Chat` creates a root user node at click position.
- Current root-creation path is: right-click canvas -> `チャットを開始` -> empty editable user node inserted directly on the canvas.
- The default first-run experience should be an empty canvas, not a seeded fake conversation tree.
- Replies create child nodes.
- Current reply-creation path is: drag from the visible right-side handle on an AI node -> empty editable user reply node inserted on the canvas.
- New nodes should appear immediately.
- If new node would be off-screen, move viewport smoothly.
- Auto-layout runs only when inserting nodes.
- The seeded workspace layout itself is arranged into a left-to-right mind-map shape with dagre.
- Existing manually moved nodes stay pinned.
- The node creation composer should stay minimal: one primary text input, attachments secondary, drag-and-drop supported for image/PDF.
- Canvas context menus must be positioned relative to the wrapper bounds, not raw viewport coordinates.
- The root-node composer should open directly on the canvas near the click point, not as a bottom dock or large modal.
- The workspace chrome should stay extremely light. Brand is enough; do not reintroduce a heavy sidebar full of explanatory copy.
- Current root-creation path is: right-click canvas -> `チャットを開始` -> floating composer placed on the canvas.
- Sidebar should exist, but only as light navigation chrome. The canvas remains the main surface.
- Current root-creation path is: right-click canvas -> `チャットを開始` -> floating composer placed on the canvas.
- The canvas should not show a centered empty-state message card. First load should be a plain movable dotted field.
- Conversation node headers are the drag handle. Keep them draggable even when the body contains inputs or scroll areas.
- Canvas zoom should respond to mouse wheel by default. Panning should remain available by dragging the pane.
- Conversation nodes should stay fixed-size by default. Do not auto-expand them on selection.
- Node body content should live inside fixed-height internal scroll regions so long text stays inside the card.
- User nodes should not be directly editable on click. Editing opens only through an explicit pencil/edit action.
- Creating a user prompt node should only place the prompt node. Gemini generation starts only when that node's `生成` button is pressed.
- Selected nodes should resize from invisible edge hit-areas with standard resize cursors, not visible dot handles.
- Double-clicking the AI node header opens the large reading view. Do not reintroduce a separate expand button in the footer.
- Creating a user prompt node should immediately create a connected AI child node on the right.
- The minimum child insertion X position must account for the full parent node width, not just an arbitrary small gap. Overlap between parent and child nodes is not acceptable.
- User nodes expose a visible right-side branch handle for drag-out AI creation. Keep that affordance large enough to grab reliably.
- Keep only one edit affordance for user nodes. Do not duplicate the pencil action in both the header and footer.
- Selected nodes should expose resizer handles so width and height can be adjusted directly from the edges.
- Use Miro/XMind-style multi-selection semantics: Ctrl/Cmd is the modifier for additive or drag-box selection. Do not overload plain right-click drag because that conflicts with the canvas context menu.
- The visible branch handle belongs on AI nodes, since follow-up user questions branch from AI responses.
- AI nodes should have a larger default footprint than prompt nodes.
- AI node height may grow with content length, but only up to a cap. Past that point, keep internal scrolling and offer a dedicated expanded reading view.
- Correction note: direct prompt creation remains node-first only. Do not auto-create an AI child until the user explicitly presses the prompt node's `生成` button.
- Correction note: the visible branch handle belongs on AI nodes, not user nodes.
- Correction note: node resize now uses a custom invisible overlay instead of React Flow's visible resize boxes. Keep cursor-driven edge and corner resizing, larger hit areas, fixed minimum node size, and internal content scroll.
- Correction note: keep default prompt and AI nodes wider than the strict text minimum so content has breathing room.
- Correction note: expose React Flow baseline keyboard and selection affordances instead of inventing custom alternatives. `Shift` handles drag-box and additive multi-selection, and `Delete`/`Backspace` removes selected nodes.
- Correction note: drag-box multi-selection must require `Ctrl/Cmd` so ordinary left-drag can stay available for canvas movement.
- Correction note: for now, remove drag-box multi-selection completely and keep only `Ctrl/Cmd + click` additive multi-selection.
- Correction note: keep a visible `オートレイアウト` action in the canvas chrome so saved or manually-moved graphs can be normalized on demand.
- Correction note: dragging out from an AI node should honor the user's drop location unless that exact spot would overlap another node. Do not snap replies to some far-off auto position when a specific drop point was given.
- Correction note: prompt nodes use header-close and footer-send. Do not move the send action outside the node shell.
- Correction note: default mind-map spacing should stay relatively tight. Prefer roughly `140px` horizontal gaps and `96px` vertical gaps unless a later requirement explicitly wants a looser graph.
- Correction note: editable prompt nodes should expose a visible `+` file-attachment action and a high-contrast send button inside the node shell. Do not hide send behind low-contrast iconography.
- Correction note: AI node auto-size may expand with content, but keep a cap. The goal is readable variance, not giant uncontrolled cards.
- Correction note: auto-layout must use each node's real saved width and height. Treating every card like one fixed-size box produces garbage spacing on mixed prompt/response graphs.
- Correction note: node right-click should expose at least `返信` and `削除`. Do not force all structural actions through only the pane context menu.
- Correction note: keep user and AI node chrome visually distinct with restrained color coding so branch roles are readable at a glance.
- Performance note: keep the conversation node component memoized and ignore callback identity in the equality check. Dragging should not rerender every untouched node on the canvas.
- Performance note: do not autosave while a node is actively dragging.
- Correction note: AI nodes should start larger than prompt nodes by default, even before content-aware growth kicks in.
- Correction note: resize hit zones should remain available without a preselection click.
- Correction note: keep branch spacing tight and top-aligned. The graph should read like a connected conversation chain, not a sparse swimlane diagram.
- Correction note: prompt nodes now stay in composer form after sending. They remain the place where users can resend, change models, and add or remove files.
- Correction note: `Create image` now generates a dedicated `image` node connected to the originating prompt node.
- Correction note: image result nodes expose preview, regenerate, and download actions inside the node itself.
- Correction note: when generated AI or image nodes grow after content arrives, reposition them again against the current graph so late size expansion does not overlap nearby nodes.
- Correction note: newly generated image nodes should autofocus into view because otherwise the feature looks dead even when the backend succeeded.
- Correction note: the canvas now supports standalone `file` nodes created by dropping images/PDFs onto empty space or by using the pane context menu.
- Correction note: prompt nodes can receive multiple incoming file/image edges, and those connected nodes must be included as explicit context alongside the normal direct-parent lineage when generating.
- Correction note: prompt nodes should expose a visible left-side input handle at all times. Do not hide prompt input connectivity behind an invisible target handle.
- Correction note: `note` nodes are plain-text memo blocks, separate from prompt nodes. Keep them editable without model or send controls.
- Correction note: clipboard images pasted onto the canvas should become standalone file nodes unless focus is currently inside a text input.
- Correction note: standalone file drops must create a visible placeholder node immediately, then transition from `generating` to `idle` or `error` after upload completion. Do not wait for upload completion before rendering the file node.
- Correction note: file nodes should use a generic node title and show the actual filename inside the body card to avoid duplicated header/body filenames.
- Correction note: note nodes reuse the same text-update path as prompt nodes. If note editing breaks, check shared node-content update wiring before touching the renderer.
- Correction note: prompt-node model selection should display exact Gemini model IDs, not fake labels like `Fast` or `Smart`.
- Correction note: the supported prompt-side text-model set now includes `gemini-3.1-pro-preview`, `gemini-3-flash-preview`, `gemini-3.1-flash-lite-preview`, `gemini-2.5-pro`, `gemini-2.5-flash`, and `gemini-2.5-flash-lite`. Image mode remains `gemini-3.1-flash-image-preview`.
- Correction note: prompt generation should include all directly connected upstream nodes as extra context, not only file/image nodes. Notes connected into prompt nodes are first-class context inputs.
- Correction note: node timestamps now live in the footer, not the header. Keep the header compact and reserve shell area for actual content.
- Correction note: generated nodes may store `tokenCount` from Gemini usage metadata and should show it as a small footer label when available.
- Correction note: file-card sizing must be tuned together with the outer file-node height. Increasing the inner file card without raising node height causes visible overflow immediately.
- Correction note: Grok-style Markdown rendering is being approximated, not copied from a public official UI kit. The reliable official signal is that xAI docs assume structured Markdown with headings/code/tables; the visual scale and spacing are inferred from the product surface.
- Correction note: the Markdown stack is now `react-markdown + remark-gfm + remark-math + rehype-katex + @tailwindcss/typography`. Tables come from GFM; math requires the KaTeX path and stylesheet.
- Correction note: keep Markdown rendering split into two layers: `prose` for narrative content and `not-prose` wrappers for fenced code blocks or other isolated surfaces that should not inherit article typography.
- Correction note: heading rhythm should follow a `shadcn-typography` style hierarchy with a visibly stronger H1-H4 size delta than Tailwind Typography's stock defaults.
- Correction note: current markdown target metrics are explicit: body `15px / 1.75`, H1 `24px`, H2 `20px`, H3 `18px`, inline code `13px` on `#f5f5f5`, and fenced code on `#0f172a` with `#e5e7eb` text. Keep future tuning grounded in concrete values instead of vague aesthetic drift.
- Correction note: tables need visibly generous cell padding and normal wrapping. If table text starts touching grid lines again, the renderer has regressed.
- Correction note: rounded markdown wrappers need their own inner padding. If table or code text appears to touch a rounded edge, fix the wrapper padding first instead of only tweaking cell text styles.
- Correction note: Gemini markdown guidance now explicitly prefers short paragraphs, concise table cells, and at most sparse tasteful emoji. Do not let the model drift into emoji spam or dense wall-of-text tables.
- Correction note: markdown inside AI nodes should not run full-width across the entire card. Keep readable line length constrained inside the content area and give display math its own vertical breathing room.
- Correction note: markdown tables should render inside a padded wrapper plus an inner bordered surface. If the first column starts touching the rounded edge again, the table wrapper has regressed.
- Correction note: block-level markdown elements need explicit sibling spacing. If a heading after a code block, quote, or table looks glued to the previous block, fix the vertical rhythm rules instead of blindly enlarging the heading itself.
- Correction note: fenced code blocks should behave like dedicated UI widgets, with a light utility header and a dark code surface. If code falls back to “just a dark rectangle,” the renderer has regressed.
- Correction note: markdown surfaces must explicitly override the app-wide list reset. If bullets or ordered markers disappear again, fix the markdown-specific list-style rules first.
- Correction note: keep the markdown surface and the node shell visually aligned. If the content starts looking cleaner than the card around it, trim the shell chrome before touching typography again.

## Attachment Lifecycle Memory

- Attachments are added only at node creation time.
- AI node regenerate may use different model and attachments.
- Expanded nodes show simple attachment cards.
- Request payload should later include lineage attachments for multimodal prompting.
- Regenerate may either keep prior AI-node attachments or replace them with a new attachment set.

## Regenerate Behavior Memory

- Regenerate acts on the existing AI node instead of creating a second sibling AI node.
- The request lineage for regenerate is built from the AI node's parent chain, not from the AI node's current content.
- Regenerate updates node-local `modelConfig` so later work can inspect which Gemini model produced the answer.
- Regenerate currently updates the AI node's visible timestamp label when a new run starts or finishes.
- Correction note: markdown tables and fenced code blocks are now supposed to render as padded product widgets, not edge-to-edge prose slabs. If table/code text starts touching rounded corners or the first column hugs the left border again, the widget wrapper has regressed.
- Correction note: AI response nodes should now start noticeably taller than before. Keep the visible card size and the React Flow `AI_NODE_SIZE` constant aligned; if those drift apart again, overlap bugs and handle drift come back immediately.
- Correction note: edges are no longer decorative. They are intended to be selectable, highlight on selection, support `Delete` removal, and allow endpoint reconnection through React Flow's built-in reconnect anchors.
- Correction note: node shell chrome should stay secondary to content. If markdown surfaces look cleaner than the surrounding card, trim shell padding/borders before touching typography again.
- Correction note: prompt nodes created by dragging out from AI/image/file handles should anchor their left-edge midpoint to the user's drop point, not their top-left corner. If the node feels offset again, fix the creation anchor before touching layout.
- Correction note: newly created prompt and note nodes should autofocus their textarea immediately on mount so typing can begin without an extra click.
- Correction note: markdown list rhythm still needs explicit post-list spacing rules; do not rely on prose defaults alone because they collapse too easily inside the node reading surface.
- Correction note: for plain markdown tables in chat responses, keep the current padded widget approach unless there is a real functional requirement a generic HTML table cannot satisfy. A heavy table library would be pointless bloat here.
- Correction note: exact canvas restoration now depends on the local snapshot layer persisting node `style` as well as position/data. Supabase still stores the structural canvas state, but same-machine reopen fidelity comes from the richer local snapshot until width/height columns exist server-side.
- Correction note: prompt nodes now intentionally default wider. If they regress to narrow cards again, check both `ROOT_NODE_SIZE` in `flow-canvas.tsx` and the user-node `defaultWidth/minWidth` in `conversation-node.tsx`.
- Correction note: markdown tables should stay compact widgets, not full-width stretched slabs. If columns start distributing awkwardly again, inspect the table width mode before touching cell padding.
