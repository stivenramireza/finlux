# Design — Agentic Chat Layout (frontend only)

## Goal
Implement the static layout of Finlux's agentic chat in the Next.js frontend,
with a Finlux welcome state and green borders as the brand accent. No behavior,
no backend, no AI.

## Tech context
- App: `frontend/` — Next.js 16 (App Router, `src/` dir), React 19, TypeScript,
  Tailwind CSS v4, ESLint + Prettier.
- Styling: Tailwind v4 with the CSS-first `@theme` configuration already present
  in `src/app/globals.css`.
- This is a presentational feature: all components are server components by
  default (no client interactivity is required for layout). No `"use client"`
  is needed unless a later spec adds behavior.

## Design tokens (green accent)
Define the green accent once as CSS variables in `globals.css`, exposed to
Tailwind via `@theme inline` so it can be used as `border-brand` / `text-brand`.

Proposed tokens (in `globals.css`):
```css
:root {
  /* existing background/foreground tokens stay */
  --brand: #16a34a;        /* green-600 — primary accent / borders (light) */
  --brand-foreground: #052e16;
}
@media (prefers-color-scheme: dark) {
  :root {
    --brand: #22c55e;      /* green-500 — brighter border for dark bg */
    --brand-foreground: #dcfce7;
  }
}
@theme inline {
  --color-brand: var(--brand);
  --color-brand-foreground: var(--brand-foreground);
}
```
Usage: `border-brand`, `text-brand`, `ring-brand`. This satisfies Requirement 3
(single source of truth for the green accent, light/dark aware).

## Layout structure
```
page (chat route)
└── <ChatShell>                     // green-bordered container, flex column, full height
    ├── <ChatHeader>                // Finlux brand line (logo/tagline)
    ├── <MessageList>               // scrollable region, flex-1
    │   ├── <WelcomeState>          // shown when there are no messages
    │   └── <MessageBubble>[]       // static placeholder bubbles (user vs agent)
    └── <MessageInput>              // green-bordered input + send button (visual only)
```

### Components
All components live under `frontend/src/app/` and `frontend/src/components/`.

- **ChatShell** (`components/chat/chat-shell.tsx`)
  - Outer container with a prominent **green border** (`border border-brand`),
    rounded corners, max-width, centered, full available height, flex column.
- **ChatHeader** (`components/chat/chat-header.tsx`)
  - Displays the Finlux brand: name "Finlux" + tagline
    "Your AI agent that brings clarity to your personal finances."
  - Bottom green divider (`border-b border-brand/40`).
- **WelcomeState** (`components/chat/welcome-state.tsx`)
  - Centered welcome shown in the empty message area: Finlux name as the focal
    point, the tagline, and one short line reinforcing clarity (no out-of-scope
    promises). Decorative mark uses the brand green.
- **MessageList** (`components/chat/message-list.tsx`)
  - Scrollable (`overflow-y-auto`), `flex-1`. Renders `WelcomeState` when the
    (hard-coded, empty or sample) list has no real messages; otherwise maps
    static sample bubbles. For this spec it renders the WelcomeState plus 1–2
    static sample bubbles to demonstrate styling.
- **MessageBubble** (`components/chat/message-bubble.tsx`)
  - Props: `{ role: 'user' | 'agent'; children }`. User bubbles align right,
    agent bubbles align left. Agent bubbles carry the green border
    (`border border-brand`); user bubbles use a neutral/filled style. Purely
    presentational.
- **MessageInput** (`components/chat/message-input.tsx`)
  - A green-bordered row: a text input with an accessible label (visually
    hidden `<label>` or `aria-label`) and a send button with an accessible
    name and an icon. No `onSubmit` behavior; the form may be a plain
    non-submitting `<form>` or a `<div role="group">`. Disabled/visual only.

### Route
- Reuse the root route: replace the default `src/app/page.tsx` content with the
  chat screen (`<ChatShell>`), since the chat is the product's primary screen.
- Update `src/app/layout.tsx` metadata: title "Finlux", description from the
  README tagline. Keep the existing fonts.
- The `<body>` already uses a flex column with `min-h-full`; `ChatShell` fills
  the available height.

## Data (static, placeholder only)
A local, in-file constant array of sample messages typed as:
```ts
type ChatRole = 'user' | 'agent';
interface ChatMessage { id: string; role: ChatRole; text: string; }
```
Used only to render static bubbles. No fetching, no state, no mutation. This
type is intentionally minimal and may be superseded by a shared type when the
real chat spec is implemented.

## Accessibility
- `main` landmark wraps the chat; header uses an appropriate heading level.
- Message input: associated `<label>` (visually hidden) + `aria-label` on the
  send button; focus-visible ring in brand green.
- Message list: `role="log"` / `aria-live="polite"` is acceptable but optional
  for a static layout; keyboard scrollable via native overflow.
- Color: green borders chosen to keep contrast in light and dark schemes.

## Out of scope (restated)
No AI, no backend, no networking, no real submission, no conversation state.
The send button and input do nothing in this spec.

## Verification
- `pnpm --dir frontend lint` passes.
- `pnpm --dir frontend build` passes.
- Manual check: welcome state shows the Finlux brand line; green borders appear
  on the shell, input, and agent bubble; layout is responsive.
