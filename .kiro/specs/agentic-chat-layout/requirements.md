# Requirements — Agentic Chat Layout (frontend only)

## Overview
Build the **visual layout** of Finlux's agentic chat interface. This is the
first screen a user sees: a conversational chat UI that welcomes them to Finlux.

This spec is **frontend markup/layout only**. There is **no** AI logic, no
backend calls, no real message sending, and no conversation state persistence.
Messages, agent responses, and data wiring are explicitly out of scope and will
be handled in later specs.

## Scope
In scope:
- A chat screen in the Next.js frontend (`frontend/`, App Router).
- A welcome state that greets the user and introduces Finlux, following the
  Finlux "logo" — i.e. the project description in the root `README.md`:
  *"Your AI agent that brings clarity to your personal finances."*
- **Green borders** as the defining visual accent of the layout.
- Static, non-functional chat elements: a scrollable message area and a message
  input with a send control (visual only).

Out of scope:
- Any LLM / agent integration (Google Gemini, Mastra, AI SDK).
- Any backend API, networking, or data fetching.
- Real message submission, streaming, or conversation history/state.
- Authentication, routing to other pages, visualizations/charts.

## Terminology
- **Welcome state**: the initial content shown before any conversation,
  greeting the user and presenting the Finlux brand line.
- **Logo / brand line**: the Finlux name plus its tagline from the root README:
  "Your AI agent that brings clarity to your personal finances."

## Requirements

### Requirement 1 — Finlux welcome
**User story:** As a new user, I want to be welcomed to Finlux when I open the
chat, so that I understand what the product is.

Acceptance criteria (EARS):
1. WHEN the chat screen loads with no messages, THE SYSTEM SHALL display a
   welcome state containing the Finlux name and its tagline
   ("Your AI agent that brings clarity to your personal finances").
2. THE welcome state SHALL present the brand line prominently as the focal point
   of the empty chat.
3. THE welcome copy SHALL be consistent with `.kiro/steering/product.md`
   (clarity, agency, trust) and SHALL NOT promise out-of-scope capabilities
   (e.g. moving money, giving regulated financial advice).

### Requirement 2 — Chat layout structure
**User story:** As a user, I want a recognizable chat layout, so that it is
obvious I can have a conversation.

Acceptance criteria (EARS):
1. THE SYSTEM SHALL render a chat container with three visual regions: a header
   area (brand), a scrollable message area, and a message input area.
2. THE message area SHALL be able to display a vertical list of message bubbles
   and SHALL visually distinguish user messages from agent messages
   (e.g. alignment and styling), using static placeholder bubbles only.
3. THE input area SHALL contain a text input and a send button, present for
   layout purposes only (no submission behavior required).
4. WHERE the viewport is narrow (mobile) or wide (desktop), THE layout SHALL
   remain usable and readable (responsive).

### Requirement 3 — Green border visual accent
**User story:** As a user, I want the interface to feel like Finlux's brand, so
that it looks cohesive and intentional.

Acceptance criteria (EARS):
1. THE chat container, the message input, and message bubbles SHALL use **green
   borders** as the defining visual accent.
2. THE green accent SHALL be defined as a reusable design token (not scattered
   hard-coded hex values) so it can be reused and adjusted in one place.
3. THE borders SHALL meet a reasonable contrast against the background in both
   light and dark color schemes.

### Requirement 4 — Accessibility and quality
**User story:** As any user, I want the UI to be accessible and well-built.

Acceptance criteria (EARS):
1. THE markup SHALL use semantic HTML and appropriate ARIA/labels (e.g. the
   input has an accessible label; the send button has an accessible name).
2. THE message area SHALL be keyboard-scrollable and the input focusable.
3. THE page metadata (title/description) SHALL reflect Finlux, replacing the
   default create-next-app values.
4. THE implementation SHALL pass `pnpm lint` and `pnpm build` in `frontend/`.
