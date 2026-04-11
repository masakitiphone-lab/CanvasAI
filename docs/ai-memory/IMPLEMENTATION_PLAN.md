# CanvasAI Implementation Plan

This project must be built in small, shippable, testable slices.

Do not implement everything at once. That is how projects turn into garbage.

## Global Development Rules

1. Implement only one layer of complexity at a time.
2. Keep each step shippable and testable in isolation.
3. Do not connect Gemini API until the node graph behavior works locally.
4. Do not add file upload until node creation and node state are stable.
5. Use mock data first, then replace with real API calls.
6. Prefer simple explicit state over clever abstractions.
7. Do not introduce collaborative features, streaming, or advanced caching in MVP.
8. Favor deterministic behavior over automation.
9. Preserve existing behavior unless the task explicitly changes it.
10. When uncertain, keep the implementation minimal and observable.

## Phase Order

### Phase 1: Shell UI Only

Target:

- Login screen placeholder
- Sidebar placeholder
- Canvas placeholder
- Routing shell
- Black-and-white desktop-first layout

Do not add:

- Real auth
- React Flow
- Gemini
- Uploads

Current implementation status:

- Complete: Next.js App Router scaffold
- Complete: root workspace shell route
- Complete: `/login` placeholder route
- Complete: placeholder sidebar
- Complete: placeholder canvas
- Not started: real authentication
- Not started: canvas engine

### Phase 2: React Flow Canvas Basics

Target:

- React Flow integration
- Pan and zoom
- Right-click empty canvas
- Minimal context menu
- `New Chat` action
- Root user node creation at click position
- Mock local state only

Do not add:

- Backend
- AI behavior

Prerequisite reminder:

- Do not start Phase 2 work until the current shell builds cleanly.

Current implementation status:

- Complete: React Flow integration
- Complete: pan and zoom
- Complete: empty-pane right-click context menu
- Complete: `New Chat` root user node creation
- Complete: local-only node state
- Not started: child reply behavior
- Not started: AI node behavior
- Not started: backend persistence

### Phase 3: Node UI and Local Node Behavior

Target:

- Separate user node and AI node appearance
- Compact and expanded states
- Expand on selection
- Max height with internal scroll
- Visual badges for `generating`, `error`, `outdated`, `orphan`
- User node editable
- AI node read-only

Do not add:

- Backend
- Gemini

Current implementation status:

- Complete: distinct user node and AI node UI
- Complete: compact mode with title and preview
- Complete: expand on selection
- Complete: capped expanded content with internal scroll
- Complete: visible badges for `generating`, `error`, `outdated`, `orphan`
- Complete: user node local editing
- Complete: AI node read-only behavior
- Complete: `shadcn/ui` introduction for MVP component styling
- Not started: reply creation behavior
- Not started: backend persistence

### Phase 4: Conversation Tree Behavior

Target:

- Replies create child nodes
- Branching mainly from AI nodes
- New nodes placed to the right by default
- Auto-layout only on insert
- Manual moves remain fixed
- Visible non-editable edges
- Smooth viewport follow if node appears off-screen

Current implementation status:

- Complete: visible parent-child linking
- Complete: simple mind-map style edge rendering
- Complete: AI-node reply action creating child user nodes
- Complete: insert-time placement to the right with vertical staggering
- Complete: visible non-editable edges
- Complete: viewport follow when newly inserted nodes fall outside view
- Complete: manual drag marks nodes pinned for later insert behavior
- Not started: richer branch-aware collision avoidance

### Phase 5: Minimal Gemini Connection

Target:

- Create empty AI node immediately on submit
- Set node status to `generating`
- Call Gemini `generateContent`
- Fill plain text response on success
- Preserve node with `error` state on failure

Do not add:

- Streaming
- Attachments
- Fancy model management

Current implementation status:

- Complete: local API route for Gemini text generation
- Complete: hardcoded Gemini model config
- Complete: immediate AI child node creation in `generating` state
- Complete: success path fills AI node content
- Complete: failure path keeps node and marks it `error`
- Not started: lineage-based payload building
- Not started: per-node model selection

### Phase 6: Proper Lineage Context

Target:

- Build direct ancestor chain only
- Exclude siblings
- Order oldest to newest
- Keep request construction explicit
- Prepare request shape for per-node model selection later

Current implementation status:

- Complete: explicit lineage builder utility
- Complete: request payload built from direct ancestor chain only
- Complete: oldest-to-newest lineage ordering
- Complete: sibling-branch exclusion verified in UI debug output
- Complete: request shape now includes `targetNodeId`, `lineage`, and `model`
- Not started: formal automated test suite

### Phase 7: Markdown Rendering

Target:

- `react-markdown`
- `remark-gfm`
- Code blocks
- Tables
- Lists
- Blockquotes
- Links

Current implementation status:

- Complete: `react-markdown` installation
- Complete: `remark-gfm` installation
- Complete: AI node Markdown rendering in expanded view
- Complete: code blocks, tables, lists, blockquotes, links, and inline code rendering
- Complete: safe renderer setup without raw HTML support
- Not started: syntax highlighting or richer code-block tooling

### Phase 8: MVP Attachments

Target:

- Image / PDF / URL attachments
- Attach only at node creation
- File metadata in database
- Actual files in storage
- URL attachments as links only
- Attachment cards in expanded nodes
- Request payload hooks for future multimodal prompting

Current implementation status:

- Complete: creation-time attachment panel for new root and reply user nodes
- Complete: image upload route
- Complete: PDF upload route validation path
- Complete: URL attachment route
- Complete: local metadata persistence in `data/attachment-metadata.json`
- Complete: local binary storage in `public/storage/attachments`
- Complete: attachment card rendering inside expanded nodes
- Complete: lineage payload hooks for future multimodal prompting
- Not started: production database adapter
- Not started: production object storage adapter
- Not started: regenerate with attachment changes

## Implementation Discipline

Always append these rules mentally before changing code:

- Do not refactor unrelated parts.
- Do not implement future steps early.
- Keep all changes local to the current step.
- Prefer visible working behavior over perfect architecture.
- Add comments only where behavior is non-obvious.
- If a requirement is ambiguous, choose the simpler behavior.
