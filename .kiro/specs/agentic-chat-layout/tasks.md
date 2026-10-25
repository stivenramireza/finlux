# Tasks — Agentic Chat Layout (frontend only)

Implementation plan. Frontend-only, static layout. No AI, no backend, no
submission behavior. All work happens in `frontend/`.

- [x] 1. Define the green brand design tokens
  - In `frontend/src/app/globals.css`, add `--brand` / `--brand-foreground`
    CSS variables (light + dark) and expose them via `@theme inline` as
    `--color-brand` / `--color-brand-foreground`.
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 2. Update page metadata and the root layout for Finlux
  - In `frontend/src/app/layout.tsx`, set `metadata.title` to "Finlux" and
    `metadata.description` to the README tagline. Keep existing fonts and the
    flex-column body.
  - _Requirements: 1.1, 4.3_

- [x] 3. Create the static message type and sample data
  - Add a minimal `ChatMessage` type (`id`, `role: 'user' | 'agent'`, `text`)
    and a small hard-coded sample array (co-located with the chat components).
  - _Requirements: 2.2_

- [x] 4. Build the MessageBubble component
  - `components/chat/message-bubble.tsx`: presentational, `role` prop, user vs
    agent alignment/styling; agent bubble uses `border border-brand`.
  - _Requirements: 2.2, 3.1_

- [x] 5. Build the WelcomeState component
  - `components/chat/welcome-state.tsx`: centered Finlux welcome using the brand
    line "Your AI agent that brings clarity to your personal finances"; green
    decorative accent; copy consistent with product.md and within scope.
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 6. Build the ChatHeader component
  - `components/chat/chat-header.tsx`: Finlux name + tagline, bottom green
    divider (`border-b border-brand/40`).
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 7. Build the MessageList component
  - `components/chat/message-list.tsx`: scrollable `flex-1` region; render
    `WelcomeState` plus 1–2 static sample `MessageBubble`s to demonstrate
    styling (user + agent). Accessible scroll region.
  - _Requirements: 2.1, 2.2, 4.2_

- [x] 8. Build the MessageInput component
  - `components/chat/message-input.tsx`: green-bordered row with a labeled text
    input (visually-hidden `<label>` or `aria-label`) and a send button with an
    accessible name + icon. Visual only, no submission.
  - _Requirements: 2.1, 2.3, 3.1, 4.1_

- [x] 9. Assemble the ChatShell and mount it on the home route
  - `components/chat/chat-shell.tsx`: green-bordered, rounded, centered,
    full-height flex column composing Header + MessageList + Input.
  - Replace the default content of `frontend/src/app/page.tsx` with `ChatShell`.
  - _Requirements: 2.1, 2.4, 3.1_

- [x] 10. Accessibility and responsiveness pass
  - Verify landmarks/headings, input label, send button name, focus-visible
    brand ring, and that the layout is readable on narrow and wide viewports.
  - _Requirements: 2.4, 4.1, 4.2_

- [x] 11. Verify build and lint
  - Run `pnpm --dir frontend lint` and `pnpm --dir frontend build`; fix any
    issues. Confirm the welcome state and green borders render as intended.
  - _Requirements: 4.4_
