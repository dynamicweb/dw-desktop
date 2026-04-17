# Design System — dw-desktop

## Product Context
- **What this is:** A cross-platform Electron desktop app that replaces FTP for Dynamicweb 10 solution management — file transfers, environment switching, add-in installs.
- **Who it's for:** Primarily developers and technical staff at DW partner agencies; also some non-technical agency staff who need to manage files without a CLI.
- **Space/industry:** Developer tooling / desktop file management. Peers: FileZilla, Transmit, Cyberduck, VS Code, Warp Terminal.
- **Project type:** Desktop app (Electron + React + TypeScript)

## Aesthetic Direction
- **Direction:** Industrial Editorial
- **Decoration level:** Intentional — architectural separators, status chips, monospace metadata. No texture, no blur, no glassmorphism.
- **Mood:** The quiet precision of a high-end developer tool. Dark mineral surfaces, warm off-white text, copper and teal signal accents. Feels competent and calm under pressure. One unexpected serif moment (empty states, onboarding) breaks the density and signals that someone cared.
- **Design principle:** Composition-first, not component-first. Every panel feels like a machine component with a clear role. Information density is a feature, not a problem to design around.

## Typography
- **UI / chrome / file names / labels:** Geist — geometric, designed for screens, not Inter. Clean without being clinical.
- **File paths / metadata / sizes / status values:** IBM Plex Mono — gives the app a tooling identity without turning the whole UI into a terminal. Tabular numerals enabled for file size columns.
- **Empty states / modal titles / onboarding moments:** Fraunces — a warm, optical-size serif that nobody uses in a file manager. When the user hits an empty state, they get a calm serif message instead of system-font bureaucracy.
- **Code snippets (if needed):** IBM Plex Mono (same as metadata)
- **Loading:** Google Fonts CDN (Geist + IBM Plex Mono + Fraunces). Self-host via fontsource in production build for offline reliability.
- **Scale:**
  - 10px — section labels, column headers (uppercase, tracked)
  - 11px — secondary metadata, mono values, small chips
  - 12px — primary UI labels, buttons, table cells, chip text
  - 13px — body text, input values, **main file names** (this is the primary reading size)
  - 14px — pane headers, emphasized values
  - 16px — sub-section labels in serif
  - 20–26px — empty state sub-headings (serif)
  - 24–28px — empty state headlines, modal titles (serif, italic)

## Color

### Dark mode (default)

```css
:root {
  --bg:              #121416;  /* Matte charcoal — not pure black */
  --surface:         #1A1D21;  /* Layered panels */
  --surface-raised:  #22262B;  /* Elevated elements, hovers */
  --surface-hover:   #2A3138;  /* Row hover, interactive hover */
  --text:            #F3F1EB;  /* Warm off-white — less clinical than gray-white */
  --text-muted:      #9AA3A9;  /* Secondary labels, metadata */
  --text-subtle:     #5C6470;  /* Column headers, placeholders, dividers */
  --accent:          #D07030;  /* Copper — actions, active state, transfers, production */
  --accent-hover:    #E0813F;
  --accent-cool:     #3FADA8;  /* Teal — remote/server identity, staging environments */
  --accent-cool-dim: #2A7A76;
  --border:          #2C2F33;  /* Architectural dividers — visible, not invisible */
  --border-strong:   #3D4249;
  --danger:          #C4453A;
  --success:         #6E8F62;
  --warning:         #B8882A;
  --selection:       #2A3138;  /* File row selection */

  /* Environment ambient tints (applied to command rail / pane header border) */
  --env-prod-accent:    #D07030;  /* Copper — production */
  --env-staging-accent: #3FADA8;  /* Teal — staging */
  --env-dev-accent:     #9AA3A9;  /* Neutral — dev / unknown */
}
```

### Light mode overrides

```css
[data-theme="light"] {
  --bg:              #F5F4F0;  /* Warm parchment, not pure white */
  --surface:         #FFFFFF;  /* Panel surface — clean white for contrast */
  --surface-raised:  #EEECE8;
  --surface-hover:   #E5E3DF;
  --text:            #1A1A18;
  --text-muted:      #6B6860;  /* Secondary labels — warm dark gray */
  --text-subtle:     #B0ABA3;  /* Placeholder, column headers — lighter */
  --accent:          #C05A18;  /* Copper darkened for legibility on light */
  --accent-hover:    #A84A10;
  --accent-cool:     #2A8C88;
  --accent-cool-dim: #1F6A66;
  --border:          #D8D5D0;
  --border-strong:   #C0BBB4;
  --danger:          #B83528;
  --success:         #527A44;
  --warning:         #9A6E1A;
  --selection:       #E8E6E2;

  --env-prod-accent:    #C05A18;
  --env-staging-accent: #2A8C88;
  --env-dev-accent:     #6B6860;
}
```

- **Dark/Light/Auto mode:** Dark is the default. Light mode uses warm parchment backgrounds, not pure white. Accents are darkened ~10% for legibility on light surfaces.
- **Environment identity:** Production environments tint the env-switcher button with `--env-prod-accent`. Staging uses `--env-staging-accent`. This ambient identity prevents the classic "deployed to prod thinking it was staging" accident — without relying on loud red warnings.

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — desktop tool, not mobile dashboard. Information density is a feature.
- **Scale:**
  - `--sp-1`: 4px
  - `--sp-2`: 8px
  - `--sp-3`: 12px
  - `--sp-4`: 16px
  - `--sp-5`: 20px
  - `--sp-6`: 24px
  - `--sp-8`: 32px
  - `--sp-10`: 40px
  - `--sp-12`: 48px

## Layout

### App shell structure

The app has four horizontal bands:

```
┌────────────────────────────────────────────────┐
│  Title bar (38px) — drag region, "DW Desktop"  │
├────────────────────────────────────────────────┤
│  Tab bar (Files / Transfer log / Debug)         │
├─────────┬──────────────────────────────────────┤
│  Env    │  Dual-pane workspace                 │
│ sidebar │  Left pane (local) │ Right pane (remote) │
│ (180px) │                                      │
├─────────┴──────────────────────────────────────┤
│  Transfer strip (bottom, always visible)        │
└────────────────────────────────────────────────┘
```

- **Title bar (38px):** Electron drag region. "DW Desktop" label (11px, --text-subtle). Theme switcher right-aligned.
- **Tab bar:** Files, Transfer log, Debug. Active tab: bottom border accent line. 11px Geist.
- **Env sidebar (180px, fixed):** List of saved environments. Active env gets copper left-border accent + surface-hover background. Env name at 12px, host URL at 10px mono. "+ Add environment" button at bottom with dashed border.
- **Dual pane (flexible height):** Left = local files, right = remote files. Separated by a 1px border. Each pane has a header bar + scrollable file list.
- **Transfer strip (bottom):** Always visible. Collapsible. Active transfers show as animated horizontal progress bars. The app feels alive when things are moving.

### Pane header
- Height: ~32px. Background: `--surface`. Bottom border: 1px `--border`.
- Left: pane label (10px, uppercase, tracked, `--text-subtle`).
- Center: path breadcrumbs (11px mono, `--text-muted`, last segment `--text`).
- Right: navigation controls (↑ up, ↻ refresh) at 12px.

### File table
- No `<table>` element — flex rows. Each row: 5px 12px padding.
- Column headers: 10px, uppercase, tracked, `--text-subtle`. Background `--surface`. Bottom border.
- File rows: 13px Geist for names, 11px IBM Plex Mono (right-aligned) for sizes.
- File type badges (e.g. "TS", "CSS"): 11px mono, `--surface-raised` background, `--text-muted`.
- Row hover: `--surface-hover` background, 80ms ease-out.
- Selected row: `--selection` background.
- Remote folder names: `--accent-cool` color.

### Empty states
- Centered in the remote pane when no environment is connected.
- Headline: 24–26px Fraunces, light weight, italic.
- Sub-text: 13px, `--text-muted`.
- CTA button: primary (copper fill).
- No illustration/icon required — the serif headline is the visual moment.

### Environment sidebar design
- Active item: `background: rgba(208, 112, 48, 0.08)`, copper left-border (2px).
- Env name: 12px, `--text`, font-weight 500.
- Host URL: 10px mono, `--text-subtle`.
- Status dot: 8px circle. Copper = production active, teal = staging active, subtle = dev/inactive.
- "Active" indicator text: 10px, `--accent`.
- Offline/error state: chip with `--danger` color.

### Transfer strip design
- Strip header: 10px uppercase "TRANSFERS" label + active count chip + "Clear done" ghost button.
- Each job row: mono filename (11px `--font-mono`) + progress bar + percentage + status chip.
- Progress bar: 4px height, full-radius. Active = copper gradient with opacity pulse animation. Done = `--success`. Queued = `--border-strong`.
- Status chips: pill shape, `--r-full`. Production/active = copper tinted. Done = success tinted. Queued = dev neutral.

## Components

### Buttons
- **Primary:** `--accent` fill, `--bg` text, 12px, font-weight 500. `--r-sm` radius. Hover: `--accent-hover`.
- **Secondary:** `--surface-raised` fill, `--text` color, `--border-strong` border. Hover: `--surface-hover`.
- **Ghost:** transparent fill, `--text-muted` color. Hover: `--surface-raised` fill, `--text` color.
- **Danger:** transparent fill, `--danger` border and text. Hover: rgba danger background.
- **Small (.btn-sm):** 3px vertical padding, 11px font.
- All buttons: 1px border (transparent for primary/ghost), `--r-sm` radius, 120ms transition.

### Status chips
Pill shape (`--r-full`). 11px, font-weight 500. 6px color dot + text. Border + tinted background.
- Production: copper dot, copper border at 40% opacity, copper fill at 8% opacity.
- Staging: teal dot, teal border at 40%, teal fill at 8%.
- Dev: `--text-muted` dot, `--border` border, `--surface` fill.
- Success: `--success` dot and colors.
- Error: `--danger` dot and colors.

### Alerts
12px. Left-side icon (14px). Background tinted at 6% opacity. Border at 30% opacity.
- Info: teal accent.
- Success: `--success`.
- Warning: `--warning`.
- Danger: `--danger`.

### Form inputs
- Background: `--surface`. Border: 1px `--border`. Text: 13px Geist. Radius: `--r-sm`.
- Focus: border color → `--accent`.
- Placeholder: `--text-subtle`.
- Mono variant (host URLs, API keys, paths): 12px IBM Plex Mono.
- Form labels: 11px, `--text-muted`, `display: block`.

## Motion
- **Approach:** Intentional — only transitions that aid comprehension. No decorative motion.
- **Easing:** enter: `ease-out`, exit: `ease-in`, move: `ease-in-out`
- **Duration:**
  - micro (hover state changes): 80–120ms
  - short (button press, row selection): 120–150ms
  - medium (panel open/close, environment switch): 200–250ms
  - transfer bar progress: `width` transition 300ms `ease`
- **Transfer bar pulse:** Active transfers use a subtle opacity pulse animation (1.5s ease-in-out infinite). Signals something is happening without being distracting.

## Design Risks (intentional departures from category norms)

1. **The editorial serif moment.** Fraunces appears only in empty states, onboarding screens, and modal titles. Nobody puts a warm serif in a file manager. When the user hits an empty environment, they read a calm italic message instead of a system-font placeholder. It signals craft.

2. **Environment as ambient identity.** Each active environment tints the env-switcher button and sidebar active row — copper for production, teal for staging, neutral for dev. Users feel the context change without a modal warning. Prevents the classic prod/staging confusion at a glance.

3. **Transfer queue as a living strip, not a list.** Progress renders as animated horizontal bars in a fixed bottom dock. The app feels alive during transfers instead of showing a static icon-and-label queue.

## Anti-patterns (never introduce these)
- Purple or violet gradients
- Uniform large border-radius on all elements (bubbly SaaS look)
- Floating cards on foggy/blurred backgrounds (glassmorphism)
- Icon-only controls for primary actions (Upload, Download must have text labels)
- Centered layouts — this is a dense desktop tool, not a marketing page
- Oversized whitespace pretending to be "premium"
- Blue/purple neon accents
- Emoji as decorative UI elements (folder emoji in file lists is acceptable; emoji as section icons is not)

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-16 | Industrial Editorial aesthetic direction | Mixed audience (devs + non-technical agency staff). Needs to feel capable and professional without being intimidating. Research showed FileZilla is the design anti-pattern (2003 enterprise feel) — clear differentiation opportunity. |
| 2026-04-16 | Geist as primary UI font | Designed for screens, geometric, premium feel. Not Inter. |
| 2026-04-16 | IBM Plex Mono for all technical values | File paths, sizes, metadata, environment hosts — monospace for scannable technical data. |
| 2026-04-16 | Fraunces serif for empty states and onboarding | Nobody in the file manager category uses a serif. Creates a memorable moment of warmth in an otherwise dense tool. |
| 2026-04-16 | Copper (#D07030) as primary accent | Warm, distinctive, not used by any peer tool. Signals action and energy without being aggressive. |
| 2026-04-16 | Teal (#3FADA8) as secondary accent for remote/server identity | Cool complements warm. Remote file pane, staging environment, server-side state. |
| 2026-04-16 | Environment ambient tinting in env switcher and sidebar | Prevents prod/staging confusion without modal warnings. Ambient UX over explicit interruption. |
| 2026-04-16 | Transfer strip as always-present bottom dock | Not a hidden drawer or tab. Transfers are core to the app — they deserve permanent real estate. |
| 2026-04-16 | 4px spacing base | Desktop density. Files, metadata, status — users need to see a lot at once. |
| 2026-04-16 | App shell: env sidebar + tab bar + dual pane | The env sidebar (180px) provides persistent context. Tab bar (Files / Transfer log / Debug) keeps secondary views accessible without cluttering the main layout. Layout confirmed correct — original mockups did not follow this. |
| 2026-04-16 | Light mode uses warm parchment (#F5F4F0), not white (#FFFFFF) | Matches the "warm mineral" aesthetic of the dark mode. Pure white would clash with the Industrial Editorial mood. |
| 2026-04-16 | Design system created | Created by /design-consultation. Research: FileZilla, Transmit, Cyberduck, VS Code, Warp Terminal. Outside voices: Codex (gpt-5.4) + Claude subagent — all three converged on dark warm palette, copper accent, monospace for metadata. |
