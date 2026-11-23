import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { APIRoute, GetStaticPaths } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { CONTENT } from '../../content/levels';
import { calculate, formatBytes, LEVEL_ORDER, LEVELS, type RaidLevel } from '../../lib/raid';

const require = createRequire(import.meta.url);
const font = (weight: number) =>
  readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`));

type Card = { title: string; subtitle: string; level?: RaidLevel };

const STATIC: Record<string, Card> = {
  home: {
    title: 'RAID Calculator',
    subtitle: 'Usable capacity, fault tolerance and rebuild risk, with a failure simulator.',
  },
  raid: { title: 'RAID levels explained', subtitle: 'RAID 0, 1, 5, 6, 10, 50, 60 and ZFS RAID-Z.' },
  compare: {
    title: 'Compare RAID levels',
    subtitle: 'Capacity, tolerance, write penalty and URE risk side by side.',
  },
};

export const getStaticPaths: GetStaticPaths = () => [
  ...Object.entries(STATIC).map(([slug, card]) => ({ params: { slug }, props: card })),
  ...LEVEL_ORDER.map((id) => ({
    params: { slug: LEVELS[id].slug },
    props: { title: LEVELS[id].name, subtitle: LEVELS[id].tagline, level: id } satisfies Card,
  })),
];

type Node = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({
  type,
  props: { style, children },
});

const COLORS = {
  data: ['#14223f', '#2f4d8c', '#a9c4ff'],
  parity: ['#2e2210', '#735317', '#f5c870'],
  mirror: ['#0f2a24', '#23675a', '#86dcc2'],
  spare: ['#16181d', '#3a3e48', '#a0a6b1'],
  hotspare: ['#16181d', '#3a3e48', '#a0a6b1'],
} as const;

function diagram(level: RaidLevel): Node | null {
  const ex = CONTENT[level].example;
  const { layout } = calculate(ex);
  const drives = layout.drives.slice(0, 12);
  const rows = Math.min(layout.rows, 3);
  return h(
    'div',
    { display: 'flex', gap: 8, height: rows * 38 + (rows - 1) * 8, flexShrink: 0 },
    drives.map((d) =>
      h(
        'div',
        { display: 'flex', flexDirection: 'column', gap: 8 },
        d.blocks.slice(0, rows).map((b) => {
          const [bg, border, fg] = COLORS[b.kind];
          return h(
            'div',
            {
              display: 'flex',
              width: 64,
              height: 38,
              borderRadius: 6,
              border: `2px solid ${border}`,
              background: bg,
              color: fg,
              fontSize: 18,
              fontWeight: 600,
              alignItems: 'center',
              justifyContent: 'center',
            },
            b.label,
          );
        }),
      ),
    ),
  );
}

export const GET: APIRoute = async ({ props }) => {
  const card = props as Card;
  let stat: string | null = null;
  if (card.level) {
    const ex = CONTENT[card.level].example;
    const r = calculate(ex);
    stat = `${ex.driveCount} × ${formatBytes(ex.driveSizeBytes).text}: ${formatBytes(r.usableCapacityBytes).text} usable · survives ${r.faultTolerance.guaranteed}`;
  }
  const tree = h(
    'div',
    {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-start',
      padding: 64,
      background: '#0b0c0f',
      color: '#eceef2',
      fontFamily: 'Inter',
    },
    [
      h('div', { display: 'flex', alignItems: 'center', gap: 16, fontSize: 28, color: '#b4b9c3' }, [
        h('div', { width: 36, height: 36, borderRadius: 9, background: '#6d7dff' }),
        'RAID Calculator',
      ]),
      h(
        'div',
        { display: 'flex', flexDirection: 'column', gap: 18, marginTop: 88, marginBottom: 52 },
        [
          h('div', { fontSize: 76, fontWeight: 700, letterSpacing: -2 }, card.title),
          h('div', { fontSize: 32, color: '#b4b9c3', maxWidth: 1000 }, card.subtitle),
          ...(stat ? [h('div', { fontSize: 26, color: '#a3aeff', marginTop: 6 }, stat)] : []),
        ],
      ),
      card.level ? diagram(card.level) : h('div', { display: 'flex' }),
    ],
  );
  const svg = await satori(tree as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Inter', data: font(400), weight: 400, style: 'normal' },
      { name: 'Inter', data: font(600), weight: 600, style: 'normal' },
      { name: 'Inter', data: font(700), weight: 700, style: 'normal' },
    ],
  });
  const png = new Resvg(svg).render().asPng();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
