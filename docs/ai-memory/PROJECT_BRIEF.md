# CanvasAI Project Brief

## Product Summary

CanvasAI is a desktop-first web MVP of a node-based AI chat application.

This is not a vertical chat feed. It is a canvas with multiple independent conversation trees coexisting on one infinite plane. Users start a new conversation by right-clicking empty canvas space and choosing `New Chat`. Replies create child nodes, and branching mainly happens from AI nodes.

## MVP Principles

- Desktop-first.
- Black-and-white visual style.
- Visual polish is secondary to correct behavior.
- User nodes are editable.
- AI nodes are not directly editable.
- Nodes are compact by default and expand on selection.
- Expanded nodes must have max height with internal scroll.
- New AI nodes should appear immediately in a generating state.
- If a newly created node would be off-screen, move the viewport smoothly.

## Most Critical Conversation Rule

Every AI request must send only the selected node's direct lineage.

That means:

- Include the selected node.
- Include its direct parents up to the root.
- Order from oldest to newest.
- Never include sibling branches.
- Never include unrelated trees on the same canvas.

If this rule is broken, the core product behavior is broken. No cute abstraction changes that.

## MVP Attachment Scope

Supported attachment types:

- Image
- PDF
- URL

Rules:

- Attachments are added only at node creation time.
- Regenerate can change model and attachments.
- URL attachments are stored as links only.

## Rendering Rules

- AI responses are rendered as Markdown.
- MVP renderer target: `react-markdown` + `remark-gfm`.

## AI Integration Rule

- MVP generation uses Gemini `generateContent`.
- Do not use the Gemini Interactions API for MVP.
- Do not connect Gemini before local node graph behavior works.

## Outdated State Rule

If a user node is edited, all descendants should be marked `outdated`.

This must be a visible and inspectable state, not hidden magic.
