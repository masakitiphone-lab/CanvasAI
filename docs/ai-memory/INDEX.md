# CanvasAI AI Memory Index

This directory is the long-lived memory for AI-assisted development in this repo.

The repo is currently empty, so these docs are the initial source of truth until code exists.

## Read Order

1. `PROJECT_BRIEF.md`
2. `IMPLEMENTATION_PLAN.md`
3. `ARCHITECTURE_MEMORY.md`
4. `DEVELOPMENT_LOG.md`
5. `CHANGE_PROTOCOL.md`

## Purpose

- Preserve the product constraints that are easy to accidentally violate.
- Preserve step-by-step implementation boundaries so future AI work does not mix phases.
- Preserve draft-but-explicit types, database shapes, and API contracts.
- Preserve a timestamped development timeline that records what changed and what the repo state became.
- Keep a running rule that these docs must be updated whenever assumptions or implementation details change.

## Non-Negotiable Product Rules

- One project has one infinite canvas.
- Multiple independent conversation trees can exist on the same canvas.
- Context for AI requests must come from the selected node's direct ancestor chain only.
- Sibling branches must never be included in request context.
- MVP uses Gemini `generateContent`, not the Interactions API.
- Build in small, safe, isolated steps. Do not implement future phases early.

## Document Status

- These docs are `Draft v0`.
- They should be revised as soon as real code, real schema, or real API decisions are introduced.
