# Hoppin Design Brief

Read this before building or changing any screen. It is the shared look-and-feel rule set.

## Principles
1. **Mobile first.** The day view, Today view and documents are used on phones while travelling. Tap targets are at least 44px (`min-h-11`), the main navigation sits at the bottom, and every screen is checked at 390px wide first.
2. **Calm by default.** Group items are solid and bold. Optional plans from members are small chips. Private items are muted with a dashed outline. Nothing competes with the group plan.
3. **Photo-led.** Trips, destinations and stays use real images (see issue #8). Layouts reserve space so images never shift the page.
4. **Motion with purpose.** Motion explains what changed. It is off or minimal when the device asks for reduced motion (issue #17).
5. **Trust cues.** "Last synced", the offline banner and the "just me" marker are always visible where they matter.

## Look: "soft pop"
Bold and playful for a Gen Z audience, but clean and elegant, never cheap. The rules that keep it that way:
- **Tinted areas, pop on small things.** Big areas are soft tints or neutrals. The pop colour (`bg-accent`) appears only on small, important things: the selected day, the main button, active states, badges. One spotlight block per screen at most (`bg-hero`: the plan happening now or next, the trip card).
- **No heavy outlines.** Large soft corners (`rounded-card`, 26px; pills are fully round), one soft shadow style, hairline borders in the palette's own `line` colour. The only dashed outline is for private plans.
- **Type:** Bricolage Grotesque (`font-display`) for titles, dates and big numbers; Inter for everything else. Both are bundled, so they work offline.
- **Navigation:** a floating pill on phones, a dark sidebar on wide screens. Content is centred at a comfortable width.
- **Dark mode is first class.** Every palette has a dark version designed on purpose, not inverted.

## Palettes (the user chooses: More > Appearance)
Three palettes, each with light, dark and follow-the-phone modes. The choice is remembered on the device and applied before the first paint.
| Palette | Feel | Pop | Big block |
|---|---|---|---|
| Rose & teal (default) | confident, elegant | rose | deep teal |
| Lilac & lime | electric, modern | violet, lime highlight | lavender |
| Tangerine & sky | sunny, playful | tangerine | sky blue |

**Palettes are data**: `apps/web/src/theme/palettes.json`. After editing it run `npm run gen:theme -w apps/web`, which regenerates `src/styles/theme.generated.css` (a test fails if it is out of date). **A test checks the contrast of every colour pair in every palette and mode** (body text 7:1, other text 4.5:1). Add a pair to `test/theme-palettes.test.ts` when you introduce a new combination. To add a fourth palette, add an entry to the JSON, regenerate, and the tests tell you if it is readable.

## Tokens: the rule for every page
Use only the semantic classes, never a raw colour (the one exception is a member's personal avatar colour in `src/lib/colors.ts`):
`bg-bg` page, `bg-surface` cards, `bg-raised` tinted areas, `text-fg` text, `text-muted` secondary text, `border-line`, `bg-accent` + `text-accent-fg` (pop), `bg-accent-soft` + `text-accent-soft-fg` (soft pop), `text-link` (links; `text-accent` is for fills only, it may not be readable as text), `bg-hero` + `text-hero-fg` + `text-hero-muted` (the spotlight block), `bg-highlight` + `text-highlight-fg` (small badges), `bg-nav`, and the status pairs `info`, `warn`, `danger`.
**Every new screen must look right in all 3 palettes and both modes.** Check it in `npm run demo` (More > Appearance) before opening a pull request, and include phone and desktop screenshots.

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
