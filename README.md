# RAID Calculator

A fast, static RAID calculator. Enter drive count, drive size and RAID level to get usable capacity (TB and TiB), fault tolerance, rebuild/URE risk, theoretical performance, and a drive diagram that doubles as a failure simulator.

Levels: RAID 0, 1, 1E, 5, 5E, 5EE, 6, 10, 50, 60, ZFS RAID-Z1/Z2/Z3 and JBOD.

## Commands

```bash
pnpm install
pnpm dev          # local dev server
pnpm build        # static production build into dist/
pnpm preview      # serve the build on :4321
pnpm test         # vitest (engine)
pnpm test:e2e     # playwright + axe (needs `pnpm build` first; run `pnpm exec playwright install chromium` once)
pnpm lint         # eslint + prettier --check
pnpm typecheck    # astro check && tsc --noEmit
```

Screenshots at 375 / 768 / 1440 px in both themes (with `pnpm preview` running):

```bash
pnpm exec tsx scripts/screenshots.ts screenshots "/?level=raid6&n=8&size=4TB"
```

Requires Node 22.12+ (see `.nvmrc`).

## Deploy

The build is fully static (`dist/`), with no server and no runtime network calls. Set `SITE_URL` to the production origin at build time so canonical URLs, OG tags, `robots.txt` and the sitemap point at the right host:

```bash
SITE_URL=https://your-domain.example pnpm build
```

- **Vercel / Netlify / Cloudflare Pages:** framework preset Astro, build command `pnpm build`, output directory `dist`, environment variable `SITE_URL`.

## Layout

```
src/lib/raid/         Pure calculation engine (no UI imports), fully unit-tested
  levels.ts           Level definitions: capacity, tolerance, performance, rebuild model, layout
  calculate.ts        calculate(config) -> RaidResult
  validate.ts         Validation errors and one-click fixes
  layout.ts           Block layouts for the diagram (rotating parity, mirrors, spans, spares)
  failure.ts          simulateFailures(layout, failedDrives) for the failure simulator
  reliability.ts      Rebuild time and URE probability
  units.ts            TB/TiB conversion and formatting (the only place rounding happens)
  url.ts              Query-string state (?level=raid6&n=8&size=4TB)
src/components/       Calculator island, drive diagram, compare island, UI primitives
src/content/levels.ts Copy for the per-level pages
src/pages/            /, /raid, /raid/[level], /compare, /og/[slug].png, /robots.txt
```

Adding a level is one entry in `LEVELS` (`levels.ts`) plus rows in the table-driven tests and an entry in `src/content/levels.ts`.

## Decisions and deviations from the spec

- **URE rate units.** `ureRate` is "one error per N bits" (`1e14 | 1e15 | 1e16`), matching the spec's formula `1 − (1 − 1/ureRate)^bits`. The spec's type literals (`1e-14`) contradicted that formula.
- **URE recoverability.** The reliability block also reports `ureRecoverable`: RAID 6, RAID 60, RAID-Z2/Z3 and 3-way mirrors still have redundancy during a single-drive rebuild, so a read error is corrected instead of losing data. The UI says so, instead of showing a scary percentage without context.
- **Suggestions** are `{ kind: 'fix' | 'tip', label, patch }`, not strings, so the UI can apply them in one click.
- **Hot spares** count toward raw capacity, so usable + parity/mirror + spare = raw and the capacity bar adds up. RAID 5E/5EE integrated spare space is reported as spare.
- **RAID 5E / 5EE capacity** follows the common (n − 2) × size convention. The 5E diagram is schematic, since spare placement varies by controller.
- **RAID-Z** figures are before ZFS metadata, slop space and padding. Random IOPS scale with vdev count.
- **Failure simulator** is driven by the block layout: each block belongs to a redundancy unit with a tolerance, and an array fails when any unit loses more blocks than it tolerates. Tests cross-check it against closed-form rules for every level and every combination of up to 4 failures.
- **Motion (framer-motion) is not used.** CSS transitions plus a small number tween cover the animations at zero bundle cost. Everything collapses to instant under `prefers-reduced-motion`.
- **Astro 6, not 7.** Astro 7 needs Node ≥ 22.23.4.
- **JS budget.** On React 19 the calculator page ships about 123 KB gzipped (react-dom alone is about 66 KB), over the ~80 KB target. Branch `spike/preact` renders the same components with Preact through `preact/compat`, at about 67 KB, with every unit and e2e/axe test passing unchanged. That is a stack change, so it is left as a proposal.
