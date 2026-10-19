# Design Guidelines (distilled from `.zcode/skills`)

Sources: `emil-design-eng`, `apple-design`, `animate`, `review-animations`,
`animation-performance`, `mobile-native`, `break-ui`, `pick-ui-library`.
These rules are mandatory for every screen in `frontend/`.

## 1. Foundations

### Typography
- System UI stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
  "Helvetica Neue", Arial, "Noto Sans SC", sans-serif`.
- Scale: 12 / 13 / 14 / 16 / 18 / 22 / 28 / 34 px. Body 14–16 px. Line height
  1.45 for body, 1.15 for headings. Letter-spacing -0.01em on headings ≥ 22 px.
- Never use font weights below 400 for body text; use 500 for controls, 600 for
  headings. No faux bold.
- Numbers in tables/metrics use `font-variant-numeric: tabular-nums`.

### Color
- Neutral-first UI. Light: background `#FAFAF9`, surface `#FFFFFF`, border
  `#E7E5E4`, text `#1C1917`, muted `#78716C`. Dark: background `#0C0A09`,
  surface `#171514`, border `#292524`, text `#FAFAF9`, muted `#A8A29E`.
- Accent is a single color chosen in Appearance (red/pink/purple/green/orange/
  blue) and used only for primary actions, selection, focus rings and progress.
- Semantic: success `#16A34A`, warning `#D97706`, danger `#DC2626`,
  info `#2563EB`. Never rely on color alone; pair with icon/text.
- Contrast: body text ≥ 4.5:1, large text ≥ 3:1, focus ring ≥ 3:1.

### Spacing and radius
- 4 px base scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Radii: 6 px (small controls), 10 px (inputs/buttons), 14 px (cards),
  20 px (sheets/modals), 999 px (pills). One radius per component class.
- Borders are 1 px and low-contrast; shadows are rare and soft
  (`0 1px 2px rgb(0 0 0 / .04), 0 8px 24px rgb(0 0 0 / .08)` for popovers only).

### Motion
- Animate only `transform` and `opacity` (composite-only). Never `all`.
- Durations: press 100 ms, hover 120 ms, popover/dropdown 150 ms, modal/sheet
  220 ms, page transition 180 ms. Easing: `cubic-bezier(.2,.8,.2,1)` for enter,
  `cubic-bezier(.4,0,1,1)` for exit.
- Buttons respond on pointer-down (`:active { transform: scale(.97) }`).
- Keyboard-initiated actions (search open, tab switch, reader page turn) do not
  animate beyond opacity. Reader page turns use a 120 ms crossfade, not slides.
- Never animate from `scale(0)`; start at `.96` + opacity 0.
- Respect `prefers-reduced-motion: reduce`: remove transforms/durations, keep
  state changes instant.
- Sheets/drawers are interruptible and drag-dismissible where practical; use
  `100dvh` and safe-area insets on mobile.

## 2. Layout and responsive contract

| Width | Shell | Content |
|---|---|---|
| ≥1280 px | 240 px sidebar, sticky | max 1200 px content; details page has 320 px right panel |
| 768–1279 px | 72 px icon rail (drawer for labels) | fluid, 24 px gutters |
| <768 px | bottom tab bar (Home/Favorites/Explore/Categories) + top bar | single column, 16 px gutters, full-screen secondary pages |

- Tailwind breakpoints only (`md:768`, `xl:1280`). No UA checks.
- All interactive targets ≥ 44×44 px on touch; ≥ 32 px on desktop.
- No horizontal scrolling at 375 px. Test every page at 375/768/1280.
- Use `min-h-dvh` (not `100vh`), `env(safe-area-inset-bottom)` for the tab bar.
- `touch-action: manipulation`, `-webkit-tap-highlight-color: transparent`,
  hover styles only under `@media (hover:hover) and (pointer:fine)`.
- Inputs use 16 px font on mobile to avoid iOS zoom.

## 3. Components

- `Button` variants: primary (accent, white text), secondary (surface + border),
  ghost (transparent), danger (red). Sizes sm 32, md 40, lg 48. Icon-only buttons
  always have `aria-label` and tooltip.
- `Input`/`Textarea`: 40 px height, visible label, helper/error text, focus ring
  2 px accent at 40% opacity. Never placeholder-only labels.
- `Modal`: centered on desktop (max 520 px), bottom sheet on mobile; focus trap,
  Escape closes, scroll lock, `aria-modal`, return focus to trigger.
- `Drawer`: right side on desktop for details/favorites/comments/settings;
  full-height sheet on mobile. 220 ms enter, 150 ms exit.
- `Tabs`: underline for page tabs, pill for filters. Keyboard arrow navigation.
- `Toast`: bottom-center on mobile, bottom-right on desktop; 4 s; stack max 3;
  errors persist 6 s and include a retry action where meaningful.
- `Skeleton`: same dimensions as final content, subtle pulse (1.6 s), disabled
  under reduced motion.
- `EmptyState`: icon, one-line explanation, one primary action.
- `ErrorState`: human message, request id in small mono, Retry button.
- `Card`: 14 px radius, 1 px border, no heavy shadow; hover lifts 1 px only on
  pointer-fine devices.

## 4. Content rules

- Every async view has explicit loading, empty and error states.
- Destructive actions require confirmation with the object name; destructive
  button is red and on the right.
- Long lists: paginate (page selector) or infinite scroll with a visible retry.
- Images: fixed aspect-ratio placeholder, `loading="lazy"`, `decoding="async"`,
  broken-image fallback with the comic title initials.
- Truncate titles to 2 lines with ellipsis; never let long words overflow.
- Use the original English labels (`.tl` keys) as the canonical strings; provide
  zh-CN/zh-TW dictionaries with the same keys.
- Copy follows the original semantics exactly: "Favorite" toggles, "Read later",
  "Download", "Continue", "Start", "Chapters", "Comments", etc.

## 5. Accessibility

- Semantic landmarks (`header`, `nav`, `main`, `aside`, `dialog`).
- Visible focus ring on every focusable element; never `outline: none` without a
  replacement.
- Modals/drawers trap focus and restore it; menus support arrow keys/Escape.
- Reader: arrow keys, Home/End, F for fullscreen, Escape to exit; all controls
  reachable by keyboard; page changes announced via `aria-live`.
- Images have `alt` (comic title + page number); decorative icons `aria-hidden`.
- Forms: label association, `aria-invalid`, `aria-describedby` for errors.

## 6. Anti-patterns (reject in review)

- Gradients as decoration, glassmorphism, glow shadows, neon accents.
- `transition: all`, `ease-in` on entrances, animations on keyboard actions.
- Icon-only buttons without labels; placeholder-only inputs.
- Cards inside cards inside cards; more than two elevation levels.
- Magic numbers in feature components; use tokens (`rounded-card`, `text-muted`).
- `any` in TypeScript; direct `fetch` in components; unhandled promise rejections.
