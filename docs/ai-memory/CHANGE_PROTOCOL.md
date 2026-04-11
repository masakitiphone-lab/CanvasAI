# CanvasAI Change Protocol

This file defines how the AI memory docs should be maintained over time.

## Update Rules

Update these docs whenever any of the following changes:

- Product behavior
- Phase order
- Node type definitions
- Database schema
- API request/response shapes
- Attachment behavior
- Gemini integration details
- Viewport or layout rules
- Any major implementation milestone that changes the practical repo state

## Editing Rules

- These docs are allowed to be rewritten. They are not sacred.
- Remove stale assumptions instead of letting contradictory notes pile up.
- Keep draft sections clearly labeled until implemented.
- When code becomes source of truth, align these docs to the code instead of leaving fantasy architecture behind.

## Minimum Required Updates Per Relevant Change

When a relevant implementation change is made, update:

1. `INDEX.md` if the reading order or scope changes.
2. `PROJECT_BRIEF.md` if product behavior changes.
3. `IMPLEMENTATION_PLAN.md` if phase order or delivery boundaries change.
4. `ARCHITECTURE_MEMORY.md` if types, schema, API, or technical rules change.
5. `DEVELOPMENT_LOG.md` with a date and time entry describing what changed, what the repo state became, and what should happen next.

## Decision Logging Format

When a major decision changes, append a short note in this format to the bottom of this file until a better changelog exists.

Also maintain `DEVELOPMENT_LOG.md` in a calendar-style format with:

- date
- time
- summary of changes
- resulting repository state
- next recommended step

```md
## Decision Log

- 2026-04-01: Initialized AI memory docs from product specification. Repo had no implementation yet.
- 2026-04-01: Completed Step 1 shell scaffold with Next.js App Router, workspace route group, login placeholder route, sidebar placeholder, and canvas placeholder.
- 2026-04-01 14:29 +08:00: Completed Step 2 React Flow canvas basics with local state, verified right-click root-node creation in browser, and fixed React Flow container sizing.
- 2026-04-01 14:46 +08:00: Completed Step 3 node UI with Tailwind CSS v4, shadcn/ui primitives, compact/expanded node behavior, status badges, and local user-node editing.
- 2026-04-01 14:55 +08:00: Completed Step 4 simple mind-map behavior on top of React Flow with visible edges, AI reply branching, insert-time layout, pinning after drag, and viewport follow.
- 2026-04-01 15:13 +08:00: Completed Step 5 minimal Gemini wiring with a local generate route, immediate generating AI nodes, and visible error fallback when configuration or API calls fail.
- 2026-04-01 15:18 +08:00: Completed Step 6 lineage-only request building, added sibling-exclusion debug output, and verified the request payload excludes sibling branches.
- 2026-04-02 10:33 +08:00: Restored a lighter sidebar, reinstated the right-click menu flow, and kept the composer as an on-canvas floating element after `チャットを開始`.
- 2026-04-01 17:32 +08:00: Tightened the mind-map presentation with dagre-backed seeded layout, stronger selected-node and active-project emphasis, and cleaner top-of-canvas chrome.
- 2026-04-01 17:46 +08:00: Added in-place AI regenerate with node-level Gemini model selection and regenerate-time attachment replacement or carry-forward.
- 2026-04-01 18:01 +08:00: Added Gemini multimodal attachment parts, `/api/canvas` persistence, Supabase Postgres/Storage support, and local JSON fallback for unconfigured environments.
- 2026-04-01 22:19 +08:00: Switched default generation to `gemini-3-flash-preview`, moved PDFs onto Gemini Files API, and created local env config from the provided secrets except for the still-missing Supabase service role key and DB password.
- 2026-04-01 22:36 +08:00: Activated live Supabase persistence, created the `canvas-attachments` bucket, and migrated the main `canvasai-mvp` project snapshot so `/api/canvas` now resolves from `supabase`.
- 2026-04-01 22:43 +08:00: Removed canned first-run conversations, reset `canvasai-mvp` to an empty canvas, simplified fake project chrome, and refreshed the login screen UI.
- 2026-04-02 09:51 +08:00: Simplified the node composer into a single-bar input with drag-and-drop attachments and fixed the canvas context menu to anchor correctly to wrapper-relative coordinates.
- 2026-04-02 10:15 +08:00: Shifted the workspace to a canvas-first minimal shell, moved root creation into an on-canvas floating composer, and stripped most remaining dashboard-style chrome.
- 2026-04-02 11:02 +08:00: Removed the empty-state card, restored immediate canvas movement, added explicit React Flow drag handles to node headers, removed visible URL-entry UI from creation/regenerate panels, and cleaned up Japanese copy in the main shell and login route.
- 2026-04-02 11:36 +08:00: Reduced the composer to a plus button, textarea, close button, and visible send icon only, and changed React Flow so pane dragging takes priority over selection dragging.
- 2026-04-02 11:55 +08:00: Reset node behavior toward a real mind-map flow with fixed-size cards, internal scroll regions, explicit edit-button-only user editing, wheel zoom, stronger dotted canvas background, and automatic right-side AI child creation after prompt submission.
- 2026-04-02 12:03 +08:00: Fixed parent/child overlap, added more node interior spacing, curved the edges, removed the duplicate edit button, and introduced a visible right-side drag-out handle for creating AI children from user nodes.
- 2026-04-02 12:16 +08:00: Added node edge resizing, normalized all edges to curved paths, moved the visible branch handle to AI nodes, and aligned multi-selection semantics with Ctrl/Cmd-based Miro/XMind-style behavior.
- 2026-04-02 12:19 +08:00: Enlarged default AI nodes, added content-aware AI height growth with a cap, and introduced a one-click large-detail reading view for long AI responses.
- 2026-04-02 12:44 +08:00: Replaced the floating composer with direct empty-node creation, changed AI branching to insert reply nodes immediately on drag-out, swapped visible resize handles for invisible edge hit-areas with standard cursors, and added non-overlapping insertion logic for new nodes.
- 2026-04-02 12:58 +08:00: Increased default node widths and padding, switched resizing back onto React Flow's full edge-and-corner resizer system, and removed the regenerate settings modal so AI reruns immediately with the current model.
- 2026-04-02 13:07 +08:00: Added an explicit auto-layout button, enabled `Shift` multi-selection and `Delete` removal, widened nodes again, and strengthened selected-node highlighting while staying on React Flow's built-in interaction model.
- 2026-04-02 13:14 +08:00: Moved drag-box multi-selection onto `Ctrl/Cmd`, redesigned prompt-node editing chrome around visible send controls, removed the text-based close button, and strengthened selected-node emphasis again.
- 2026-04-02 15:52 +08:00: Replaced React Flow's visible resize boxes with a custom invisible resize overlay, widened the resize hit areas, and kept node content inside fixed minimum cards with internal scroll instead of relying on cramped auto-growth.
- 2026-04-02 16:12 +08:00: Made AI-branch drag-out honor the release point, tightened node spacing and auto-layout distances, moved prompt close into the header, restored a clear in-node send button, and widened the canvas zoom range.
- 2026-04-02 16:20 +08:00: Made the prompt close button visibly red, added in-node file attachment via `+`, restored a high-contrast black send button, and allowed AI node width to grow with content up to a cap.
- 2026-04-02 16:31 +08:00: Fixed dagre layout to use real node sizes, added node right-click `返信` and `削除`, removed the prompt close button again, and split user/AI node chrome with restrained color coding.
- 2026-04-02 16:40 +08:00: Memoized conversation nodes, disabled autosave churn during drag, enabled React Flow visible-element rendering optimization, and removed dead composer-era CSS.
- 2026-04-02 16:54 +08:00: Increased default AI node sizing, made resize zones available without preselection, tightened branch spacing again, and top-aligned AI-originated reply insertion.
```

## Decision Log

- 2026-04-01: Initialized AI memory docs from product specification. Repo had no implementation yet.
- 2026-04-01: Completed Step 1 shell scaffold with Next.js App Router, workspace route group, login placeholder route, sidebar placeholder, and canvas placeholder.
- 2026-04-01 14:29 +08:00: Completed Step 2 React Flow canvas basics with local state, verified right-click root-node creation in browser, and fixed React Flow container sizing.
- 2026-04-01 14:46 +08:00: Completed Step 3 node UI with Tailwind CSS v4, shadcn/ui primitives, compact/expanded node behavior, status badges, and local user-node editing.
- 2026-04-01 14:55 +08:00: Completed Step 4 simple mind-map behavior on top of React Flow with visible edges, AI reply branching, insert-time layout, pinning after drag, and viewport follow.
- 2026-04-01 15:13 +08:00: Completed Step 5 minimal Gemini wiring with a local generate route, immediate generating AI nodes, and visible error fallback when configuration or API calls fail.
- 2026-04-01 15:18 +08:00: Completed Step 6 lineage-only request building, added sibling-exclusion debug output, and verified the request payload excludes sibling branches.
- 2026-04-02 15:52 +08:00: Replaced visible resize handles with a custom invisible overlay, widened resize hit areas, and fixed left/top/corner resize so position and size update together.
- 2026-04-02 16:12 +08:00: Tightened node spacing, kept prompt send/close controls inside the node shell, and changed AI drag-out insertion to prefer the actual drop position.
- 2026-04-02 16:20 +08:00: Restored visible prompt-node action affordances and switched AI nodes to capped content-aware width growth.
- 2026-04-02 16:31 +08:00: Corrected auto-layout for mixed-size nodes, exposed node-level context actions, and removed the redundant prompt close control.
- 2026-04-02 16:40 +08:00: Reduced drag-time canvas overhead by memoizing node rendering and pausing autosave during active drags.
- 2026-04-02 16:54 +08:00: Tightened branch spacing and made node resizing available even before selection.
- 2026-04-02 17:30 +08:00: Replaced the detached AI detail view with in-canvas focus zoom, rebuilt the sidebar into a real chat navigator, and separated the AI branch handle from the resize hit area.
- 2026-04-02 17:47 +08:00: Tightened AI-response Markdown rendering into a more Grok-like reading surface while keeping the same `react-markdown` and `remark-gfm` stack.
- 2026-04-02 18:02 +08:00: Switched additive selection to `Shift + click`, limited drag-box selection to `Ctrl/Cmd + left-drag`, restored node text selection, and made prompt edit mode close on outside focus.
- 2026-04-02 18:21 +08:00: Moved drag-box selection behind live `Ctrl/Cmd` modifier state, fixed text cursors inside node bodies, widened default AI cards again, and added a Markdown-focused Gemini `system_instruction`.
- 2026-04-02 18:45 +08:00: Replaced the sidebar root-node list with true canvas navigation, made `New canvas` create blank workspaces, realigned the AI branch handle, and switched the background to a faint grid.
- 2026-04-02 18:50 +08:00: Rebuilt the prompt footer into a composer-style toolbar with model selection, a microphone placeholder, a future-tools `+` menu, and a clearer circular send action, while also darkening edge rendering.
- 2026-04-02 18:56 +08:00: Kept unsent prompt nodes visually open as draft composers until they generate their first AI child.
- 2026-04-02 19:04 +08:00: Replaced the native model dropdown with a custom menu, cleaned up attachment chips with inline removal, hardened the black send button styling, and centered the AI branch handle on the node edge.
- 2026-04-02 19:10 +08:00: Aligned AI node wrapper sizing with the visible card minimum width and split attachment presentation into removable document chips plus square image thumbs.
- 2026-04-02 19:31 +08:00: Added Gemini API image generation via `gemini-3.1-flash-image-preview`, persisted generated images through the attachment layer, introduced a dedicated `image` node kind, and wired preview, regenerate, and download actions into the canvas.
- 2026-04-02 22:16 +08:00: Repositioned generated AI/image nodes after final content sizing, increased default AI node size again, and auto-focused the viewport onto newly generated image nodes so the image workflow stays visible.
- 2026-04-02 23:11 +08:00: Removed image-generation auto camera movement, made `Create image` a prompt-side mode switch, added a visible `Image` mode chip, thickened edge styling, and animated generating nodes with a pulse.
- 2026-04-03 00:03 +08:00: Added standalone `file` nodes, canvas drag-and-drop file creation, pane-menu file insertion, file-node output handles, and prompt generation that now incorporates connected file/image input nodes as extra context.
- 2026-04-03 00:13 +08:00: Removed the prompt-node header edit button and made the prompt node's left target handle visible by default for incoming file/image connections.
- 2026-04-03 00:26 +08:00: Added `note` nodes, canvas clipboard-image paste handling, and kept plain-text paste behavior scoped to prompt/note textareas.
- 2026-04-03 11:21 +08:00: Repaired file-node creation so dropped files render immediately as placeholder nodes with progress UI, enlarged standalone file cards, restored editable note-node content updates, and normalized the pane context-menu labels.
- 2026-04-03 11:51 +08:00: Replaced vague prompt-model labels with explicit Gemini model IDs, expanded the selectable Gemini model list to current 3.1/2.5 variants, and changed prompt request building so all connected upstream nodes including memo nodes are sent as context.
- 2026-04-03 12:06 +08:00: Compressed node headers, moved timestamps into footers, added token-count display from Gemini usage metadata, and resized file-card/file-node geometry so file content remains inside the node block.
- 2026-04-03 13:03 +08:00: Swapped the Markdown styling base to `@tailwindcss/typography`, added `remark-math` + `rehype-katex` + `katex`, and kept `remark-gfm` for table/task-list support.
- 2026-04-03 13:37 +08:00: Rebuilt the Markdown renderer around a `shadcn-chatbot-kit` / `Prompt Kit` style class structure, moved fenced code blocks into `not-prose` containers, and strengthened H1-H4 hierarchy with `shadcn-typography`-like sizing.
- 2026-04-03 13:54 +08:00: Tightened Markdown typography to explicit body/heading/code/blockquote values so the renderer follows concrete reading metrics instead of vague prose defaults.
- 2026-04-03 13:59 +08:00: Cleaned up Markdown weak spots by increasing table-cell padding, adding code-block left breathing room, and flattening blockquote spacing.
- 2026-04-03 15:04 +08:00: Increased default AI node size, added inner wrapper padding to tables and code blocks, and tightened Gemini markdown instructions around spacing, concise tables, and restrained emoji use.
- 2026-04-03 15:08 +08:00: Constrained markdown line length, increased AI content padding, added display-math spacing, and tightened Gemini guidance so technical answers default away from emoji.
- 2026-04-03 15:15 +08:00: Reworked markdown tables into a roomier bordered wrapper, widened AI content padding again, and enlarged display-math presentation.
- 2026-04-03 15:19 +08:00: Strengthened markdown vertical rhythm, turned quotes into tinted blocks, and separated code/quote/table blocks from following headings.
- 2026-04-03 15:23 +08:00: Rebuilt code blocks into a headered widget, made tables compact bordered cards, and pushed markdown styling closer to the supplied ChatGPT-like reference.
- 2026-04-03 15:31 +08:00: Restored markdown list markers, switched code blocks to `react-syntax-highlighter`, and tightened table rendering toward the supplied reference.
- 2026-04-03 15:42 +08:00: Slimmed node chrome, centered markdown widgets, and aligned the AI node content panel more closely with the refined renderer.
- 2026-04-03 15:59 +08:00: When adjusting markdown visuals, verify widget-level padding first (table/code/quote wrappers) before changing font sizes again. Edge selection and reconnection are now intentional product behavior, so any future change that disables `edge.selectable`, `edgesReconnectable`, or selected-edge highlighting must be documented explicitly.
- 2026-04-03 16:11 +08:00: When adjusting drag-created prompt behavior, preserve the left-center anchor and immediate autofocus. If markdown spacing regresses again, verify list-to-paragraph and quote-to-following-block rhythm in the renderer before touching global prose sizing.
