# CLAUDE.md — RAID Calculator

## What we're building

A free, public RAID calculator website: enter drive count, drive size, and RAID level, and get usable capacity, fault tolerance, performance characteristics, and a visual of how data and parity are laid out across the drives.

The reference point for features is raid-calculator.com. The reference point for **quality** is Linear, Vercel, Stripe, and Raycast. The existing calculators online are ugly, ad-cluttered, and from 2009. This one should feel like a precision instrument built by a team that cares: fast, calm, exact, and pleasant to use on any device.

**North star:** someone sizing a storage server (a sysadmin, a pre-sales engineer on a customer call, a homelabber) gets a trustworthy answer in under 10 seconds and wants to bookmark the site.

---

## Tech stack

- **Framework:** Astro (static output) with React islands for the interactive calculator. We want near-instant loads and strong SEO for the per-RAID-level content pages; the calculator is the only heavily interactive part.
- **Language:** TypeScript, `strict: true`. No `any` without a comment explaining why.
- **Styling:** Tailwind CSS v4 with design tokens defined as CSS variables (see Design system). No component library that imposes its own look; use Radix UI primitives (or similar unstyled, accessible primitives) for selects, tooltips, popovers, tabs, and dialogs.
- **Animation:** Motion (framer-motion) for the drive diagram and state transitions. Respect `prefers-reduced-motion`.
- **Testing:** Vitest for the calculation engine (required), Playwright for end-to-end smoke tests and visual checks.
- **Lint/format:** ESLint + Prettier. Run both before considering any task done.
- **Package manager:** pnpm.
- **Deploy target:** static hosting (Vercel, Netlify, or Cloudflare Pages). No server, no database, no accounts.

If you think a different stack choice is clearly better for a specific piece, propose it and explain the trade-off before switching.

---

## Project structure

```
src/
  lib/raid/            # Pure calculation engine. Zero UI imports. 100% unit-tested.
    levels.ts          # RAID level definitions (metadata + rules)
    calculate.ts       # Main entry: calculate(config) -> Result
    capacity.ts
    faultTolerance.ts
    performance.ts
    reliability.ts     # Rebuild time, URE risk
    units.ts           # TB/TiB conversion and formatting
    layout.ts          # Generates the block layout used by the drive diagram
    types.ts
    __tests__/
  components/
    calculator/        # Calculator island and its subcomponents
    diagram/           # Drive / stripe visualization
    ui/                # Shared primitives (Button, NumberInput, Segmented, Tooltip...)
  pages/
    index.astro        # The calculator
    raid/[level].astro # Content page per RAID level (raid-5, raid-6, raid-10, ...)
    compare.astro      # Side-by-side comparison
  styles/
    tokens.css
```

**Hard rule:** all math lives in `src/lib/raid` as pure, deterministic functions. Components never compute capacity or tolerance themselves; they call the engine and render its result.

---

## Calculation engine spec

### Inputs

```ts
type RaidConfig = {
  level: RaidLevel;
  driveCount: number;          // total drives in the array, excluding hot spares
  driveSizeBytes: number;      // stored in bytes internally, always
  groups?: number;             // span/group count for RAID 50 / 60 (and nested levels)
  hotSpares?: number;
  // optional performance / reliability inputs
  driveReadMBps?: number;
  driveWriteMBps?: number;
  driveIops?: number;
  ureRate?: 1e-14 | 1e-15 | 1e-16;   // bits read per unrecoverable error
  rebuildMBps?: number;
};
```

Drive size input in the UI accepts GB or TB (decimal, how drives are marketed). Internally store bytes. Always show both **raw decimal (TB)** and **what the OS reports (TiB)**, because "I bought 8 TB drives, why does it say 7.27" is the most common confusion and we should answer it before it's asked.

### Supported levels (v1)

| Level | Min drives | Constraint | Usable capacity | Guaranteed fault tolerance | Best case | Write penalty |
|---|---|---|---|---|---|---|
| RAID 0 | 2 | — | n × s | 0 | 0 | 1 |
| RAID 1 | 2 | n-way mirror | s | n − 1 | n − 1 | 2 (n for n-way) |
| RAID 1E | 3 | — | (n × s) / 2 | 1 | ⌊n/2⌋ non-adjacent | 2 |
| RAID 5 | 3 | — | (n − 1) × s | 1 | 1 | 4 |
| RAID 5E | 4 | integrated spare | (n − 2) × s | 1 (then rebuilds into spare) | 1 | 4 |
| RAID 5EE | 4 | distributed spare | (n − 2) × s | 1 | 1 | 4 |
| RAID 6 | 4 | — | (n − 2) × s | 2 | 2 | 6 |
| RAID 10 | 4 | n even | (n / 2) × s | 1 | n / 2 (one per mirror) | 2 |
| RAID 50 | 6 | g ≥ 2, each group ≥ 3, n divisible by g | (n − g) × s | 1 | g (one per group) | 4 |
| RAID 60 | 8 | g ≥ 2, each group ≥ 4, n divisible by g | (n − 2g) × s | 2 | 2g (two per group) | 6 |

**Stretch (v1.1):** ZFS RAID-Z1 / Z2 / Z3 (parity 1/2/3 per vdev, multiple vdevs), and JBOD/span. Design the level definitions so adding these is just a new entry plus tests.

### Outputs

```ts
type RaidResult = {
  valid: boolean;
  errors: ValidationError[];     // human-readable, e.g. "RAID 10 needs an even number of drives"
  suggestions: string[];         // e.g. "Add 1 drive to make this valid" / "Try RAID 6 for 2-drive tolerance"
  rawCapacityBytes: number;
  usableCapacityBytes: number;
  efficiency: number;            // usable / raw, 0..1
  parityOrMirrorBytes: number;
  hotSpareBytes: number;
  faultTolerance: { guaranteed: number; bestCase: number; note: string };
  performance: {
    readMultiplier: number;      // relative to a single drive, theoretical
    writeMultiplier: number;
    writePenalty: number;
    readIops?: number;
    writeIops?: number;
    readMBps?: number;
    writeMBps?: number;
  };
  reliability?: {
    rebuildHours: number;              // driveSize / rebuildMBps, shown as an estimate
    ureProbabilityDuringRebuild: number; // chance of hitting a URE while reading surviving drives
  };
  layout: StripeLayout;          // block map for the diagram (see below)
};
```

### Math notes

- Performance numbers are **theoretical**, not benchmarks. Label them clearly as estimates. Write IOPS = (n × driveIops) / writePenalty; read IOPS ≈ n × driveIops for striped/parity levels.
- URE probability during a rebuild: bits that must be read = (surviving drives needed for reconstruction) × drive size in bits; P(at least one URE) = 1 − (1 − 1/ureRate)^bits. Use a numerically stable form (`-Math.expm1(bits * Math.log1p(-1/ureRate))`). Show this for single-parity levels prominently; it's the honest reason people move from RAID 5 to RAID 6 on large drives.
- Mixed drive sizes are out of scope for v1, but put a one-line note in the UI: "Arrays use the smallest drive's capacity per member."
- Never round inside the engine. Round only at the formatting layer.

### Tests (non-negotiable)

- Table-driven tests for every level: min drives, invalid counts, capacity, efficiency, tolerance, write penalty.
- Known-answer cases, e.g. 8 × 4 TB RAID 6 = 24 TB usable (21.83 TiB), tolerance 2; 12 × 8 TB RAID 60 with 2 groups = 64 TB usable; 6 × 2 TB RAID 10 = 6 TB, guaranteed 1, best case 3.
- Unit conversion round-trips and formatting edge cases (0, very large arrays, PB range).
- Property tests where cheap: usable ≤ raw; efficiency between 0 and 1; adding a drive never decreases usable capacity for a valid config.

Write the engine and its tests **before** building UI.

---

## Features

### v1 (must ship)

1. **Calculator** — RAID level selector (segmented control or rich select with a one-line description of each), drive count stepper, drive size input with presets (1, 2, 4, 8, 12, 16, 20, 24 TB, plus common SSD sizes like 960 GB, 1.92 TB, 3.84 TB, 7.68 TB), group count for 50/60, hot spares.
2. **Live results** — update on every input change with no "Calculate" button. Headline number is usable capacity, large and confident. Secondary: raw, efficiency, fault tolerance, write penalty.
3. **Capacity bar** — one horizontal bar split into usable / parity-or-mirror / hot spare, with exact values on hover.
4. **Drive diagram (the signature feature)** — render each drive as a column with stripes as rows, color-coding data, parity (P, Q), mirror copies, and spare space. It should visibly match the real layout of the chosen level (rotating parity for RAID 5/6, mirrored pairs for RAID 10, grouped spans for 50/60).
5. **Failure simulator** — click a drive to fail it. The diagram shows which blocks are lost and whether the array survives (degraded / failed). Fail a second drive to show why RAID 10 survival depends on *which* drive fails. This is the thing that makes the site memorable and teaches the concepts better than any paragraph.
6. **Validation that helps** — invalid configs show a calm inline message plus a one-click fix ("Make it 8 drives").
7. **Shareable state** — the full config lives in the URL query string (`?level=raid6&n=8&size=4TB`). A "Copy link" button. Loading a URL restores exactly that state.
8. **Units toggle** — TB/TiB (and GB/GiB for small arrays). Remember the choice in localStorage, wrapped in try/catch.
9. **Per-level content pages** — `/raid/raid-5`, `/raid/raid-6`, etc. Plain-English explanation, when to use it, when not to, a pre-filled embedded calculator, and a small diagram. These drive search traffic; write them well.
10. **Compare** — pick 2–4 levels with the same drives and see them side by side (capacity, tolerance, write penalty, URE risk).

### v1.1 (nice to have)

- ZFS RAID-Z levels and multi-vdev pools.
- Advanced panel: drive IOPS/throughput and rebuild speed inputs to drive the performance and reliability estimates.
- Export results as a PNG card or a short text summary to paste into an email or quote.
- Keyboard shortcut palette (⌘K) to jump between levels.

### Not doing

- Accounts, backends, analytics that track individuals, popups, cookie walls, or display ads. If monetization comes later it must not touch the calculator UX.

---

## Design system

### Direction

Precise, technical, quiet confidence. Think instrument panel, not marketing site. Dark mode first-class (many users are sysadmins at night), light mode equally polished. Default to the system preference with a toggle.

### Tokens (define in `tokens.css`, consume via Tailwind)

- **Color:** a near-neutral gray scale (slightly cool), one accent color for interactive elements, and a small semantic palette used *only* in the diagram and status: data, parity, mirror, spare, failed, degraded/warning. Each must pass WCAG AA contrast against both backgrounds, and the diagram must not rely on color alone (use labels/patterns: "D", "P", "Q", "M", hatching for spare, an X for failed).
- **Type:** one clean sans (e.g. Inter or Geist) plus a mono (e.g. JetBrains Mono or Geist Mono) for all numbers. Use tabular figures (`font-variant-numeric: tabular-nums`) everywhere numbers change so values don't jitter while typing.
- **Spacing:** 4px base scale. Generous whitespace. Results never cramped.
- **Radius & depth:** subtle radii (6–12px), hairline borders, minimal shadows. No glassmorphism-for-its-own-sake, no gradients-on-everything.
- **Motion:** 150–250ms, ease-out, purposeful. Numbers can tween when they change. Diagram transitions animate layout changes. Everything collapses to instant under reduced motion.

### Layout

- Desktop: inputs on the left (~360px), results and diagram on the right. Results visible without scrolling at 1280×800.
- Mobile: inputs stacked on top, sticky compact result bar showing usable capacity and tolerance, diagram scrolls horizontally if needed. Touch targets ≥ 44px.
- Number inputs: stepper buttons, arrow-key increment, shift+arrow for ×10, scroll-wheel disabled to avoid accidental changes.

### Quality bar ("world-class" means these, specifically)

- Every state is designed: empty, valid, invalid, degraded, failed, loading of the island, and extreme values (2 drives, 200 drives, 30 TB drives).
- No layout shift as numbers change.
- Tooltips explain jargon (write penalty, URE, hot spare) in one sentence.
- Copy is short, direct, and correct. No "Oops!" No exclamation points.
- Favicon, OG image per page (generated at build), proper titles and meta descriptions, sitemap, `robots.txt`, JSON-LD for the tool.

---

## Non-functional requirements

- **Performance:** Lighthouse ≥ 95 in all four categories on mobile. Initial JS for the calculator island under ~80 KB gzipped. LCP under 1.5s on a fast 4G profile.
- **Accessibility:** WCAG 2.2 AA. Fully keyboard operable, including the failure simulator (drives are focusable buttons with descriptive labels). Results region uses `aria-live="polite"`. Test with axe in Playwright.
- **Correctness over cleverness:** if a number could be misread, label it. If a figure is an estimate, say so next to it.
- **No runtime network calls.** Everything works offline once loaded.

---

## How to work in this repo

1. Start with `src/lib/raid` and its tests. Get every level correct and green before touching UI.
2. Build UI primitives next, then the calculator, then the diagram, then the failure simulator, then content pages, then compare.
3. After each milestone run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Don't call something done if any fail.
4. Use Playwright to screenshot the calculator at 375px, 768px, and 1440px in both themes after UI changes, and actually look at the screenshots for alignment, overflow, and contrast issues.
5. Keep components small and named for what they show (`CapacityBar`, `DriveColumn`, `FaultToleranceBadge`). Co-locate component tests when there's logic worth testing.
6. Commit in small, logical steps with clear messages.
7. When a spec detail here seems wrong (math, a min-drive rule, a UX choice), say so and propose a fix rather than silently diverging.

## Commands

```bash
pnpm dev          # local dev server
pnpm build        # static production build
pnpm preview      # serve the build
pnpm test         # vitest
pnpm test:e2e     # playwright
pnpm lint
pnpm typecheck    # astro check && tsc --noEmit
```

## Definition of done (v1)

- All v1 features working on desktop and mobile, both themes.
- Engine test suite passing with every level covered by known-answer tests.
- Lighthouse and axe targets met.
- Deployed to a preview URL, and a shared link reproduces the exact configuration.
