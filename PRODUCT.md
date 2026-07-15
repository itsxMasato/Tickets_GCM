# Product

## Register

product

## Users

Four strictly-scoped internal roles, each with a different relationship to the ticket flow:

- **Supervisor de campo** — generates tickets from the field, on mobile/tablet, often under poor connectivity. Sees only their own. Fast capture is the job; everything else is friction.
- **SAC (Servicio al cliente)** — global admin of everything. Triage, assignment, re-assignment across areas. Must move through hundreds of tickets a day; the interface must stay out of the way.
- **Admin de área** — receives tickets assigned to their area, works them through `en_proceso → solucionado`. Never closes. Cares about their own queue, not the global picture.
- **Jefe inmediato** — closes, reopens, audits their area. Decision-maker; expects overview + detail in the same screen.

Context: Spanish-language, used 8+ hours a day on desktop, occasionally on tablet by supervisors. GCM is a shrimp-industry operator (operaciones, logística, mantenimiento) — corporate but operationally hands-on. The brief is explicit that **SAC needs a lightweight interface** ("ligera y fácil") and **each role only sees what belongs to them**.

## Product Purpose

Centralize the lifecycle of an internal request from `recibido → asignado → en_proceso → solucionado → cerrado` (with a `reabierto` branch from `solucionado` or `cerrado`), so that:

- a field incident becomes a structured record within minutes of being raised,
- the right area picks it up without manual routing,
- supervisors, admins, and chiefs each have a focused view of *their* work, never more,
- every state change, comment, file, and re-assignment is captured as part of the ticket's history,
- reports can be exported (Excel/PDF) by SAC and chiefs for downstream analysis.

Success = a closed ticket whose history reads as a coherent narrative, with no information lost between roles.

## Brand Personality

**Operacional premium.** Three words: *serio, inmediato, fiable*.

The login already commits to this — navy primary, glass card over a cinematic field video, accent red drawn from the brand ("Rojo camarón"). We refine that direction rather than replace it: real data, real numbers, no fake "12.4M Registros" / "99.98% Uptime" theater. The feel is closer to a control room for a serious operation than to a consumer SaaS product.

Voice in copy: direct, Spanish, no emoji, no exclamation marks. Imperative for actions ("Asignar", "Cerrar", "Reabrir"). No "Welcome back, Juan!" — instead "Hola, Juan".

## Anti-references

Things we explicitly do **not** want to look like:

- **Generic admin templates** — Trello-board-meets-Jira-tables. No zebra tables, no endless icon+label sidebar sections, no 8-KPI dashboards with no hierarchy. We have one column of role-relevant KPIs, full stop.
- **Identical layouts per role** — each role's dashboard must reflect its actual job. Supervisor sees their own tickets. Admin de área sees their queue + history. Jefe sees area-wide overview + decision controls. SAC sees triage surfaces. If the four dashboards are interchangeable, the design has failed.
- **SaaS-cream / wellness-app polish** — no pastel gradients, no friendly illustrations, no celebratory micro-interactions, no "🎉 ticket cerrado!" toasts. This is an internal tool, not a consumer product.
- **Inflated hero metrics** — no fabricated stats in the login hero. If it shows a number, that number comes from the real system state on login.
- **Marketing-style reveal animations** — content must be visible by default. Page-load reveals must not gate visibility.
- **Side-stripe borders on cards** (left/right colored accent stripes) — no. Use full borders, background tints, leading numbers.
- **Eyebrow text on every section** — one deliberate kicker per surface at most; never one per card.

## Design Principles

1. **Each role is a different surface.** Triage (SAC), execution (admin), audit (jefe), capture (supervisor) — the UI's primary task for each is different. The design serves the role, not the framework.
2. **Visibility is a security feature.** Each role sees only what the brief allows. Leaks (SAC seeing chat where they shouldn't, supervisor seeing other areas' tickets) are design bugs, not just data bugs.
3. **History is the product.** The chat-like ticket view is not decoration — it is the system of record. State changes, comments, attachments, re-assignments all live there, in order.
4. **Real data, real numbers.** Every visible metric is computed from live state. No placeholder content, no fake stats. The login hero can be premium *and* truthful.
5. **Calm density over busy decoration.** Lots of information per screen, but a quiet surface — one accent color, generous spacing, no competing gradients.
6. **Reduce motion by default.** Animations exist for state transitions only; no decorative entrances. Full `prefers-reduced-motion` support already in code; treat as a baseline.

## Accessibility & Inclusion

WCAG AA baseline, with these specifics already committed or required:

- Body text contrast ≥ 4.5:1, large text ≥ 3:1 against any background (status badges, KPI values, table cells).
- Status communicated by **dot + label + color** (already implemented) — never color alone, so deuteranopes and protanopes can still parse state.
- Visible focus rings on every interactive element; keyboard navigation through ticket list → detail → chat composer is fully supported.
- `prefers-reduced-motion` honored globally (already in `styles.css`); no decorative animations run when set.
- Form inputs: labeled, with error messages announced via `aria-live="polite"` (already wired on the login form).
- Spanish-language UI; no mixed-language strings.