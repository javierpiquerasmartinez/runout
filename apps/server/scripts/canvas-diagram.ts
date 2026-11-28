// Writes diagram boards for the Runout design canvas, in the form its editor
// wants: every card and every straight arrow segment a separate placed
// element inside one `position: relative` host (the canvas's rules are in the
// Design artifact's `artifact-type/reference/diagrams.md`). Pure functions, no
// I/O; `data-model-canvas.ts` is the one caller in the repo.

export const COLOURS = {
  background: '#0B0F0E',
  card: '#121917',
  border: '#253230',
  text: '#ECF1EF',
  muted: '#A7B4B0',
  faint: '#75837F',
  line: '#3A4A47',
  brass: '#E0A050',
  teal: '#3FC0A0',
} as const;

// The fonts the other boards load: uploads of this canvas, so the URLs only
// resolve inside it.
const FONT_FACES = [
  ['Instrument Sans', 'normal', 400, 'cb66e83252655042d20b6221e7e79761'],
  ['Instrument Sans', 'normal', 600, '7c217ab78e3c48bee8d6e60d6958bb48'],
  ['Instrument Serif', 'normal', 400, 'f4bdae6e793e782ee89bdc2c26506aa4'],
  ['IBM Plex Mono', 'normal', 400, '785944c4f09356656718f038a99acd7d'],
  ['IBM Plex Mono', 'normal', 600, '1c78a374c243d72b432b8e59d7b5664d'],
]
  .map(
    ([family, style, weight, id]) =>
      `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:swap;src:url(/_blob/${id}) format('woff2')}`,
  )
  .join('\n');

export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Inner markup: text and inline tags only, so the card drags as one. */
  html: string;
  /** Extra inline style, e.g. a brass top border. */
  style?: string;
}

export interface Edge {
  from: string;
  to: string;
  /** What the arrow says, for a screen reader: "Hand to Hand facts". */
  name: string;
  /** y of the arrow's tail on the source, absolute. Default: the middle. */
  fromY?: number;
  /** y of the arrow's tip on the target, absolute. Default: the middle. */
  toY?: number;
  /** A short label by the vertical run. */
  label?: string;
  dashed?: boolean;
  /** Straight down or up between two cards that share some of their width. */
  vertical?: boolean;
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

interface Point {
  x: number;
  y: number;
}

const GAP = 48;
const STROKE = 2;
const HEAD = STROKE * 2;

function cardMarkup(box: Box): string {
  return (
    `<div style="position: absolute; left: ${box.x}px; top: ${box.y}px; width: ${box.w}px; height: ${box.h}px; ` +
    `box-sizing: border-box; padding: 12px 16px; display: flex; align-items: flex-start; justify-content: flex-start; ` +
    `text-align: left; background: ${COLOURS.card}; border: 1px solid ${COLOURS.border}; border-radius: 10px; ` +
    `color: ${COLOURS.text}; font-family: 'IBM Plex Mono', monospace; font-size: 12px; line-height: 20px; ` +
    `${box.style ?? ''}"><span style="white-space: nowrap">${box.html}</span></div>`
  );
}

/**
 * The polyline of one edge, orthogonal, the last point the arrow's tip, 1px
 * short of the target's edge. `lane` nudges the vertical run so that edges
 * sharing a gap do not lie on one another.
 */
function routeOf(
  from: Box,
  to: Box,
  edge: Edge,
  lane: number,
): { points: Point[]; laneX: number } {
  const fromY = edge.fromY ?? from.y + from.h / 2;
  const toY = edge.toY ?? to.y + to.h / 2;
  if (edge.vertical) {
    const left = Math.max(from.x, to.x);
    const right = Math.min(from.x + from.w, to.x + to.w);
    const x = Math.round((left + right) / 2) + lane;
    const down = to.y > from.y;
    return {
      laneX: x,
      points: down
        ? [
            { x, y: from.y + from.h },
            { x, y: to.y - 1 },
          ]
        : [
            { x, y: from.y },
            { x, y: to.y + to.h + 1 },
          ],
    };
  }
  if (to.x >= from.x + from.w + GAP) {
    const gapMiddle = (from.x + from.w + to.x) / 2;
    const laneX = gapMiddle + lane;
    return {
      laneX,
      points: [
        { x: from.x + from.w, y: fromY },
        { x: laneX, y: fromY },
        { x: laneX, y: toY },
        { x: to.x - 1, y: toY },
      ],
    };
  }
  if (to.x + to.w <= from.x - GAP) {
    const gapMiddle = (to.x + to.w + from.x) / 2;
    const laneX = gapMiddle + lane;
    return {
      laneX,
      points: [
        { x: from.x, y: fromY },
        { x: laneX, y: fromY },
        { x: laneX, y: toY },
        { x: to.x + to.w + 1, y: toY },
      ],
    };
  }
  // Same column: round the outside, down the left.
  const laneX = Math.min(from.x, to.x) - 24 + lane;
  return {
    laneX,
    points: [
      { x: from.x, y: fromY },
      { x: laneX, y: fromY },
      { x: laneX, y: toY },
      { x: to.x - 1, y: toY },
    ],
  };
}

let markerCount = 0;

function segmentMarkup(
  a: Point,
  b: Point,
  withHead: boolean,
  ariaLabel: string | null,
  dashed: boolean,
): string {
  const horizontal = a.y === b.y;
  const n = horizontal ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
  const h = withHead ? HEAD : 0;
  let left: number;
  let top: number;
  let width: number;
  let height: number;
  let path: string;
  if (horizontal) {
    left = Math.min(a.x, b.x);
    top = a.y - 4;
    width = n;
    height = 8;
    path =
      b.x > a.x
        ? `M 0 4 L ${n - h} 4`
        : `M ${n} 4 L ${h} 4`;
  } else {
    left = a.x - 4;
    top = Math.min(a.y, b.y);
    width = 8;
    height = n;
    path =
      b.y > a.y
        ? `M 4 0 L 4 ${n - h}`
        : `M 4 ${n} L 4 ${h}`;
  }
  const colour = COLOURS.line;
  const dash = dashed ? ' stroke-dasharray: 6 6;' : '';
  const aria = ariaLabel
    ? `role="img" aria-label="${escapeHtml(ariaLabel)}"`
    : 'aria-hidden="true"';
  let defs = '';
  let marker = '';
  if (withHead) {
    markerCount += 1;
    const id = `dc-arrow-head-filled-${markerCount}`;
    defs =
      `<defs><marker id="${id}" orient="auto" markerWidth="5" markerHeight="5" refX="2" refY="2" overflow="visible">` +
      `<path d="M0 0 L4 2 L0 4 Z" fill="${colour}" stroke="none" style="stroke: none; fill: ${colour}; fill: context-stroke"/></marker></defs>`;
    marker = ` marker-end="url(#${id})"`;
  }
  return (
    `<svg ${aria} width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" ` +
    `style="position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px; overflow: visible; fill: none; ` +
    `stroke: ${colour}; stroke-width: ${STROKE}; stroke-linecap: round; stroke-linejoin: round;${dash}">${defs}` +
    `<path d="${path}"${marker}></path></svg>`
  );
}

function edgeMarkup(
  from: Box,
  to: Box,
  edge: Edge,
  lane: number,
): { markup: string; labelMarkup: string } {
  const { points, laneX } = routeOf(from, to, edge, lane);
  const segments: string[] = [];
  const real = points.filter(
    (p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y,
  );
  for (let i = 0; i < real.length - 1; i += 1) {
    const last = i === real.length - 2;
    segments.push(
      segmentMarkup(
        real[i],
        real[i + 1],
        last,
        last ? `From ${edge.name}` : null,
        edge.dashed === true,
      ),
    );
  }
  let labelMarkup = '';
  if (edge.label) {
    const width = Math.ceil(edge.label.length * 8 + 8);
    const middleY =
      points.length === 2
        ? (points[0].y + points[1].y) / 2
        : (points[1].y + points[2].y) / 2;
    labelMarkup =
      `<div style="position: absolute; left: ${Math.round(laneX + 12)}px; top: ${Math.round(middleY - 8)}px; width: ${width}px; ` +
      `font-size: 13px; line-height: 16px; color: ${COLOURS.faint}; font-family: 'IBM Plex Mono', monospace">${escapeHtml(edge.label)}</div>`;
  }
  return { markup: segments.join('\n'), labelMarkup };
}

export interface Board {
  title: string;
  caption: string;
  lead: string;
  width: number;
  height: number;
  boxes: Box[];
  edges: Edge[];
}

/** The whole `.dc.html` of one board. */
export function boardMarkup(board: Board): string {
  const byId = new Map(board.boxes.map((box) => [box.id, box]));
  const laneUse = new Map<string, number>();
  const arrows: string[] = [];
  const labels: string[] = [];
  for (const edge of board.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) throw new Error(`Edge ${edge.name}: unknown card`);
    // Edges that share the same two columns get lanes 12px apart.
    const key = `${Math.round(from.x)}|${Math.round(to.x)}`;
    const used = laneUse.get(key) ?? 0;
    laneUse.set(key, used + 1);
    const lane = (used % 8) * 12 - 24;
    const { markup, labelMarkup } = edgeMarkup(from, to, edge, lane);
    arrows.push(markup);
    if (labelMarkup) labels.push(labelMarkup);
  }
  const heading =
    `<div style="position: absolute; left: 64px; top: 48px; width: ${board.width - 128}px; display: flex; flex-direction: column; gap: 8px">` +
    `<span style="font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.18em; color: ${COLOURS.faint}; text-transform: uppercase">${escapeHtml(board.caption)}</span>` +
    `<span style="font-family: 'Instrument Serif', Georgia, serif; font-size: 40px; line-height: 1; color: ${COLOURS.text}">${escapeHtml(board.title)}</span>` +
    `<span style="font-size: 14px; line-height: 20px; color: ${COLOURS.muted}; max-width: 1100px">${escapeHtml(board.lead)}</span>` +
    `</div>`;
  const host =
    `<div style="position: relative; width: ${board.width}px; height: ${board.height}px; background: ${COLOURS.background}; ` +
    `font-family: 'Instrument Sans', system-ui, sans-serif; color: ${COLOURS.text}">\n` +
    [heading, ...arrows, ...board.boxes.map(cardMarkup), ...labels].join('\n') +
    `\n</div>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(board.title)} — Runout</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>
${FONT_FACES}
body{margin:0;background:${COLOURS.background};color:${COLOURS.text};-webkit-font-smoothing:antialiased}
</style>
</helmet>
${host}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${board.width},"height":${board.height}}}'>
class Component extends DCLogic {
  renderVals() {
    return {};
  }
}
</script>
</body>
</html>
`;
}
