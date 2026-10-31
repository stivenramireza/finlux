---
name: finlux-ui-design
description: Design and refine the Finlux agent chat UI so it stays on-brand (green accent, light/white surface) but feels warm, human, and friendly — not generic "AI-generated". Use when creating or restyling any frontend UI (chat shell, bubbles, input, welcome/empty states, auth screens, buttons, notices) in the Next.js app.
metadata:
  app: "@finlux/frontend (Next.js 16 App Router, React 19, Tailwind v4)"
  tokens-source: "frontend/src/app/globals.css (single source of truth)"
---

# Finlux UI design — friendly, on-brand, less "AI design"

How Finlux's interface should look and feel. The goal is to keep the existing
**green brand accent on a light/white surface**, but make the UI noticeably more
**warm, human, and trustworthy** — and deliberately avoid the flat, generic,
"obviously-AI-generated" look.

This is a **design-guidance** skill: it defines principles, do/don't rules, the
real design tokens, and a verification checklist. It does not itself implement a
redesign — the Designer (and Frontend Engineer) apply it when building or
restyling UI. Finlux is conversation-first with supporting visuals; the chat is
the primary surface.

## Non-negotiables (keep these)
- **Brand green is the only accent color.** Primary actions, focus rings, the
  agent's identity (bubble border/tint), and the brand mark all use the green
  token — never introduce a second accent hue.
- **Light/white primary surface.** The main background stays white
  (`--background: #ffffff`); green and neutrals do the work. Keep contrast
  AA-legible.
- **Dark mode is preserved.** The app supports `prefers-color-scheme: dark`
  today. Any new surface must define both schemes by using the tokens (which
  already mirror light/dark) — never hard-code a hex that only works in one
  scheme. "White background" describes the light scheme; do not remove dark mode
  unless the user explicitly asks for that (it is a separate product decision).
- **Tokens are the single source of truth.** All color comes from the CSS
  variables in `frontend/src/app/globals.css`, consumed as Tailwind utilities
  (`bg-background`, `text-foreground`, `border-brand`, `bg-brand-tint`,
  `text-brand`, `bg-surface`, `text-muted-foreground`, `ring-brand`). Do not add
  raw hex in components. If a genuinely new shade is needed, add a token in
  `globals.css` (both schemes) and expose it via `@theme inline` — then use it.
- **Scope & copy stay honest.** Finlux records only the user's **income and
  expenses** (transactions). Copy must never promise accounts, money movement,
  bank connections, or regulated advice. Voice: clarity, agency, trust.
- **Accessibility is part of the design**, not an afterthought: semantic HTML,
  labeled controls, visible brand focus ring on every interactive element,
  `aria-live` for the message log, keyboard operability, decorative marks
  `aria-hidden`.

## Design tokens (verified — reuse, don't reinvent)
From `frontend/src/app/globals.css`:

| Token | Light | Role |
|-------|-------|------|
| `--background` | `#ffffff` | base page / card surface (white) |
| `--foreground` | `#171717` | primary text |
| `--surface` | `#f7f8f7` | subtle panels: header/input bars, user bubble |
| `--muted-foreground` | `#5c5f5c` | secondary / supporting copy (AA on white) |
| `--brand` | `#16a34a` (green-600) | the accent: borders, primary button, rings |
| `--brand-foreground` | `#052e16` | text/icon on a solid brand fill |
| `--brand-tint` | ~8% brand over bg | soft fills (agent bubble, brand mark) |

Dark scheme mirrors these (brand brightens to green-500 `#22c55e`, tint ~14%).
Tailwind utilities: `*-background`, `*-foreground`, `*-surface`,
`*-muted-foreground`, `*-brand`, `*-brand-foreground`, `*-brand-tint`.

## What "friendly, less AI design" means here
Make the interface feel like a thoughtful product a person made, not a default
template. Concretely:

### Do
- **Warm up the green.** Use the brand green generously but *softly*: prefer
  `bg-brand-tint` fills, `border-brand/60`, and tinted surfaces over large flat
  slabs of saturated green. Let green feel like a friendly highlight, not a
  warning.
- **Rounded, soft shapes.** Keep the generous radii already in use
  (`rounded-2xl` cards, `rounded-full` pills/avatars, `rounded-bl-md`/`-br-md`
  bubble tails). Rounded + a gentle `shadow-sm`/soft shadow reads human.
- **Give it breathing room.** Comfortable padding and line-height
  (`leading-relaxed`), clear vertical rhythm (`gap-4/5`), `text-balance` /
  `text-pretty` on headings and helper copy. Generous whitespace feels calm and
  intentional.
- **Add warmth with small human touches.** A friendly empty/welcome state with
  the brand mark and a short, personable line; conversational microcopy;
  example prompts or gentle suggestions; a subtle, tasteful "typing" indicator.
  Tiny, purposeful motion (fade/slide-in of a new bubble, a soft pulse on the
  pending state) — restrained, never flashy.
- **Depth and texture, lightly.** A soft shadow, a hairline tinted border, or a
  faint brand-tint background panel adds depth without clutter. A single, subtle
  brand-tinted accent (e.g. behind the welcome mark) is welcome.
- **Personable, specific copy.** Short, human sentences in the product's voice.
  Speak to "you". Prefer "Ask about your income and expenses…" over generic
  filler.
- **Consistent iconography.** Keep the existing simple stroke icons (consistent
  weight, `currentColor`) so they inherit the scheme.

### Don't (the "AI design" smells to avoid)
- No multi-color gradients, neon glows, glassmorphism, or purple/blue "AI"
  gradients. Green + white + neutrals only.
- No big flat slab of pure `--brand` as a page background; green is an accent.
- No dense, cramped, edge-to-edge layouts with no whitespace.
- No generic stock hero with a vague tagline and three identical feature cards;
  this is a focused chat product, not a landing-page template.
- No second accent color, no random emoji sprinkled as decoration, no
  inconsistent corner radii or icon weights.
- No decorative text that overpromises scope (accounts, money movement, advice).
- No removing accessibility affordances for the sake of a "cleaner" look.

## Where the UI lives (apply changes here)
- Chat: `frontend/src/components/chat/` — `chat-shell.tsx` (outer card),
  `chat-header.tsx`, `message-list.tsx`, `message-bubble.tsx`,
  `pending-bubble.tsx`, `welcome-state.tsx`, `message-input.tsx`,
  `error-notice.tsx`.
- Auth: `frontend/src/components/auth/` — `auth-screen.tsx`, `auth-brand.tsx`,
  `auth-field.tsx`, `login-form.tsx`, `register-form.tsx`, `logout-button.tsx`,
  `loading-card.tsx`.
- Tokens: `frontend/src/app/globals.css`. Global layout/metadata:
  `frontend/src/app/layout.tsx`, `page.tsx`.
Reuse the existing components and their brand styling; restyle rather than
duplicate. Auth and chat must read as one product (same tokens, radii, focus,
brand mark).

## Procedure
1. Identify the surface to design/restyle and read the current component(s) and
   `globals.css` so you build on the real tokens and structure.
2. Apply the principles above: soft green on white, rounded + roomy, warm human
   touches, honest copy — while keeping every existing accessibility affordance.
3. Only add a new color by adding a **token** in `globals.css` (light + dark)
   and exposing it via `@theme inline`; never hard-code hex in a component.
4. Keep both color schemes correct (test light and dark); keep contrast AA.
5. If this Next.js version matters for an API you touch, heed
   `frontend/AGENTS.md` and read the relevant guide under
   `node_modules/next/dist/docs/` before writing code.

## Verify (required before declaring done)
Run from `frontend/` (pnpm, pinned; never npm/yarn):
```bash
pnpm lint
pnpm format:check
pnpm build
```
Then review manually:
- Green is a friendly accent on a white (light) surface; no second accent, no
  gradient/neon/glass; green is not a flat page-wide slab.
- Rounded, roomy, warm — reads human, not like a default template.
- Light **and** dark schemes both look right (all color via tokens; no stray
  hex; AA contrast).
- Every interactive element has a visible brand focus ring; the message log is
  keyboard-scrollable with `aria-live`; the brand mark is `aria-hidden`.
- Copy stays in scope (income/expenses only) and on-voice (clarity, agency,
  trust); no out-of-scope promises.

## Guardrails
- Frontend-only; do not change backend, agent behavior, or API contracts for a
  visual change.
- No new runtime dependency for styling unless clearly justified (Tailwind v4 +
  the tokens should cover it); if one is truly needed, pin it and flag it.
- Do not introduce new design tokens casually — prefer the existing set; add one
  only when a real need exists, and define it in both schemes.
