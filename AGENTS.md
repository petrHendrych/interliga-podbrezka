<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

- **Use `proxy.ts` instead of `middleware.ts`**: Starting with Next.js 16, Middleware is renamed to Proxy. Always use `proxy.ts` in the root (or `src/`) and export a `proxy` function (either as a named export or default export). Do NOT create `middleware.ts`.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:design-rules -->
# Mobile-First Design

The main and first focus of the design should be mobile view. All components and layouts must be optimized for mobile devices before considering larger screens.
<!-- END:design-rules -->

<!-- BEGIN:check-rules -->
# Quality Check Rules

Before finishing any task, you must run linting and type checks. No TypeScript errors or linting violations (Airbnb style) are allowed.
Strictly avoid using the `any` type in the codebase.
<!-- END:check-rules -->

<!-- BEGIN:decision-rules -->
# Decision Making Rules

Always ask questions instead of running your assumptions to confirm key decisions.
<!-- END:decision-rules -->

<!-- BEGIN:plan-rules -->
# Plan Mode Rules

When working in plan mode, the plan must be detailed and written to a file — never delivered only as a chat message.

- **Location**: save every plan to `.junie/plans/<kebab-case-slug>.md`. The slug describes the task in a few words (e.g. `add-team-bank-section.md`, `speed-up-dashboard-filter.md`). Reuse the existing file when iterating on a plan that is already there.
- **Write the file before presenting the plan** for approval, so the approved plan and the file always match. If the plan changes during discussion, update the file.
- **Level of detail**: name concrete files, functions, columns, and components. Include code or SQL snippets for non-obvious changes. A step should be executable without re-deriving decisions.

### Required structure

```markdown
# Requirements

### Overview & Goals
### Scope            (explicit In Scope / Out of Scope lists)
### User Stories     (or Functional Requirements)

# Technical Design

### Current Implementation
### Proposed Changes  (split into numbered `#### N. <Area> (\`path/to/file.ts\`)` subsections)
### Architecture Diagram  (mermaid)
### Key Decisions     (options considered and why one was chosen)
### Edge Cases / Risks

# Delivery Steps

### Step 1: <imperative title>
### Step 2: ...

# Testing

### Validation Approach
```

- **Delivery Steps** must be ordered, independently verifiable, and each state which files it touches. Mark a step done by prefixing its title with `✓` while executing the plan.
- **Testing** must state how the change is validated (lint, type check, manual flows to click through, data to verify).
- Every plan ends with the mandatory lint and type check from the Quality Check Rules as the final step.
<!-- END:plan-rules -->

<!-- BEGIN:money-rules -->
# Money Calculation Rules

Rules for calculating gatherings (fines) and bonuses for each role.

### Role: Player
**Gatherings (to be paid to the bank):**
- **Score < 600**: 1€ per game.
- **Worst in Team**: 1€ per game (lowest total score among players with total > 0).
- **Team under 3750 (Interliga home matches only)**: 10€ per player who played (total > 0), when the team total is below 3750. Exactly 3750 is fine — only under 3750 is penalised. Does not apply away or in the Slovak Cup.
- **Faults (Sequential Fine)**: Sum of numeric order of faults. Formula: `(n * (n + 1)) / 2`.
  - 1 fault = 1€
  - 2 faults = 1€ + 2€ = 3€
  - 3 faults = 1€ + 2€ + 3€ = 6€
  - ... and so on.
- **Special Faults**: 5€ per occurrence (marked manually).
  - Includes: Fault into playing full, missing 2nd to last throw.
- **Success Gathering**: 10€ for 5th and every subsequent consecutive game without a fault (5th, 6th, 7th... consecutive game with 0 faults).

**Bonuses (to be received):**
- **Score > 700**: 40€ total (30€ from team bank + 10€ from trainer).

### Role: Trainer
**Payments (to be paid by trainer):**
- **Team Performance**:
  - Team Total > 3800: 10€
  - Team Total > 3900: 15€ (replaces the 3800 bonus, not cumulative).
- **Zero Faults Bonus**: 10€ if the team plays without any faults (at least 6 players must be present).
- **Elite Player Bonus**: 10€ paid to any player who scores > 700.

### Role: Admin
**Responsibilities:**
- Approving new user registrations.
- Manually marking special faults (playing full fault, 2nd to last throw miss).
- Manually marking 5-game faultless streaks.
- General system maintenance and data synchronization.
<!-- END:money-rules -->
