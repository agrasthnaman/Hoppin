# Hoppin Design Brief

Read this before building or changing any screen. It is the shared look-and-feel rule set.

## Principles
1. **Mobile first.** The day view, Today view and documents are used on phones while travelling. Tap targets are at least 44px (`min-h-11`), the main navigation sits at the bottom, and every screen is checked at 390px wide first.
2. **Calm by default.** Group items are solid and bold. Optional plans from members are small chips. Private items are muted with a dashed outline. Nothing competes with the group plan.
3. **Photo-led.** Trips, destinations and stays use real images (see issue #8). Layouts reserve space so images never shift the page.
4. **Motion with purpose.** Motion explains what changed. It is off or minimal when the device asks for reduced motion (issue #17).
5. **Trust cues.** "Last synced", the offline banner and the "just me" marker are always visible where they matter.

## Look
- **Palette:** warm cream and white neutrals, one deep teal accent (`--accent`), warm status colours for info, stale and conflict banners.
- **Dark theme:** deep teal-tinted greys with a bright teal accent.
- **Person colours:** eight deep colours in `src/lib/colors.ts` (`personColor(index)`), each keeps white text at 4.5:1 or better. A member keeps the same colour on their avatar and chips everywhere.
- **Shape:** large radii (cards `0.875rem`, buttons and chips fully round), soft shadows.
- **Type:** Inter, falling back to the system font. Body 16px, small text no smaller than 12px.
- **Icons:** Lucide.

## Tokens and theming
- All colours live as CSS variables in `apps/web/src/styles/tokens.css` and are exposed to Tailwind as `bg-bg`, `bg-surface`, `bg-raised`, `text-fg`, `text-muted`, `border-line`, `bg-accent`, `text-accent-fg`, and the banner pairs.
- **Never use raw hex colours in components** (the only exception is a member's person colour).
- Light is the default. Dark follows the system setting unless `data-theme` is set. Put `data-theme="light"` or `"dark"` on the `<html>` element to force one, or on any wrapper to preview it.

## Components (`apps/web/src/components/ui/`)
`Button` (primary, secondary, ghost), `Card`, `Avatar`, `Chip`, `Banner` (offline, stale, conflict), `Sheet` (bottom sheet on phones, dialog on desktop), `Tabs`. Built on Radix primitives for accessibility. Preview them with `npm run dev -w apps/web`.

## Accessibility rules
- Every interactive element is reachable by keyboard and has a visible focus outline.
- Dialogs trap focus and close on Escape.
- Offline and stale banners are polite announcements; conflicts are alerts.
- Automated axe checks run in the component tests. Colour contrast cannot be computed in the test environment, so it is verified in real browsers in issue #26.

## Review checklist for UI pull requests
- Screenshots at 390px and 1280px, in light and dark.
- Keyboard-only walkthrough of the new screen.
- No raw colours, no fixed pixel widths that break at 390px.
- Works offline from the local cache (where the screen requires it).

Screenshots of the current components: `docs/ui-screenshots/`.
