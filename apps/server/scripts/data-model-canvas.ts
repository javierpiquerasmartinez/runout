// Writes the "Data model" page of the Runout design canvas from the Drizzle
// schema: one board per group of tables and an overview of how the groups
// refer to each other. It reads the BUILT schema, so run `pnpm build` first.
//
//   pnpm --filter @runout/server db:canvas -- --out <folder>
//
// <folder> gets `project/DataModel*.dc.html` and `canvas-entries.json`, the
// boards' sizes for the canvas's `canvas.json`. It also writes
// `docs/canvas-sync.json`, the stamp `canvas-sync.spec.ts` checks against the
// latest migration. Publishing to the canvas is a separate step (AGENTS.md,
// "Design").
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../dist/database/schema.js';
import {
  type Board,
  type Box,
  COLOURS,
  type Edge,
  boardMarkup,
  escapeHtml,
} from './canvas-diagram.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../../..');

interface Group {
  file: string;
  title: string;
  lead: string;
  /** Columns of the board, each a stack of tables, top to bottom. */
  columns: string[][];
}

const GROUPS: Group[] = [
  {
    file: 'DataModelIdentity',
    title: 'Identity and access',
    lead: 'Accounts and anonymous identities (ADR 0003, 0005), the Invitations that create Accounts (ADR 0008), their sessions, password resets, Impersonations, Screen Names and Preferences.',
    columns: [
      ['invitations', 'password_resets', 'password_attempts'],
      ['identities'],
      ['sessions', 'impersonations', 'screen_names', 'preferences'],
    ],
  },
  {
    file: 'DataModelPlans',
    title: 'Plans',
    lead: 'Every change of an Account’s Plan, with who or what made it (ADR 0011). The Plan an Account is on now is `identities.plan`; this table is its history.',
    columns: [['plan_changes']],
  },
  {
    file: 'DataModelLibrary',
    title: 'Hands and Library',
    lead: 'A Hand is stored once; an Account’s Library holds references to it (ADR 0004), with the facts worked out at import (ADR 0012), Notes, Marks, Tags, saved filters and tallies.',
    columns: [
      ['tags', 'library_tallies', 'saved_filters'],
      ['tag_links', 'library_entries'],
      ['hands'],
      ['hand_facts', 'notes', 'marks'],
    ],
  },
  {
    file: 'DataModelRooms',
    title: 'Rooms',
    lead: 'A Room, who is in it, the queue of Hands it holds as references (ADR 0002) and where its playback is (ADR 0009).',
    columns: [['rooms'], ['queue_entries', 'room_memberships', 'playbacks']],
  },
  {
    file: 'DataModelImports',
    title: 'Imports',
    lead: 'The preview of an import into a Room, and the Bulk Imports that run apart from the server in batches (ADR 0010).',
    columns: [['import_previews', 'bulk_imports']],
  },
  {
    file: 'DataModelLab',
    title: 'Lab',
    lead: 'Ranges, which hold combos edited by hand class (ADR 0006), and the Lab’s own tags.',
    columns: [['ranges'], ['range_tag_links'], ['lab_tags']],
  },
  {
    file: 'DataModelPlanningSupport',
    title: 'Planning and Support',
    lead: 'The calendar’s milestones, Goals, and the Support Tickets an Account opens with their messages. Unrelated to one another: they share only their Account.',
    columns: [['milestones', 'goals'], ['support_tickets'], ['support_messages']],
  },
];

const SHORT_TYPES: Record<string, string> = {
  'timestamp with time zone': 'timestamptz',
  'timestamp without time zone': 'timestamp',
  'double precision': 'float8',
  'character varying': 'varchar',
};

interface TableInfo {
  name: string;
  columns: {
    name: string;
    type: string;
    nullable: boolean;
    primary: boolean;
  }[];
  references: { column: string; table: string; target: string }[];
}

function tablesOf(): Map<string, TableInfo> {
  const tables = new Map<string, TableInfo>();
  for (const value of Object.values(schema)) {
    let config;
    try {
      config = getTableConfig(value as PgTable);
    } catch {
      continue;
    }
    const compositeKey = new Set(
      config.primaryKeys.flatMap((key) => key.columns.map((c) => c.name)),
    );
    const references = config.foreignKeys.map((foreignKey) => {
      const reference = foreignKey.reference();
      return {
        column: reference.columns[0].name,
        table: getTableConfig(reference.foreignTable).name,
        target: reference.foreignColumns.map((c) => c.name).join(', '),
      };
    });
    tables.set(config.name, {
      name: config.name,
      columns: config.columns.map((column) => {
        const type = column.getSQLType();
        return {
          name: column.name,
          type: SHORT_TYPES[type] ?? type,
          nullable: !column.notNull,
          primary: column.primary || compositeKey.has(column.name),
        };
      }),
      references,
    });
  }
  return tables;
}

const HEADER = 28;
const ROW = 20;
const PADDING = 12;
const CHARACTER = 7.3;
const TOP = 240;
const COLUMN_GAP = 220;
const STACK_GAP = 56;
const BIG_TABLE = 40;

interface Laid {
  box: Box;
  rowY: Map<string, number>;
}

function cardOf(
  table: TableInfo,
  group: Group,
  groupOf: Map<string, Group>,
  x: number,
  y: number,
): Laid {
  const referenceOf = new Map(table.references.map((r) => [r.column, r]));
  const shown =
    table.columns.length > BIG_TABLE
      ? table.columns.filter((c) => c.primary || referenceOf.has(c.name))
      : table.columns;
  const hidden = table.columns.length - shown.length;
  const lines: string[] = [];
  const plain: string[] = [];
  const rowY = new Map<string, number>();
  shown.forEach((column, index) => {
    const reference = referenceOf.get(column.name);
    let tag = '';
    let tagText = '';
    if (column.primary) {
      tagText = ' PK';
      tag = ` <span style="color: ${COLOURS.brass}">PK</span>`;
    }
    if (reference) {
      const crossGroup = groupOf.get(reference.table) !== group;
      tagText += ` → ${reference.table}.${reference.target}`;
      tag += ` <span style="color: ${crossGroup ? COLOURS.brass : COLOURS.teal}">→ ${escapeHtml(reference.table)}.${escapeHtml(reference.target)}</span>`;
    }
    const type = column.type + (column.nullable ? '?' : '');
    lines.push(
      `${escapeHtml(column.name)} <span style="color: ${COLOURS.faint}">${escapeHtml(type)}</span>${tag}`,
    );
    plain.push(`${column.name} ${type}${tagText}`);
    rowY.set(column.name, y + PADDING + HEADER + index * ROW + ROW / 2);
  });
  if (hidden > 0) {
    const note = `… ${hidden} more columns, the facts worked out at import (ADR 0012)`;
    lines.push(`<span style="color: ${COLOURS.faint}">${escapeHtml(note)}</span>`);
    plain.push(note);
  }
  const longest = Math.max(
    table.name.length * 1.2,
    ...plain.map((line) => line.length),
  );
  const width = Math.max(280, 2 * Math.ceil((longest * CHARACTER + 32 + 8) / 2));
  const height = PADDING * 2 + HEADER + lines.length * ROW;
  const heading = `<b style="color: ${COLOURS.text}; font-size: 14px; line-height: ${HEADER}px; display: inline-block">${escapeHtml(table.name)}</b>`;
  return {
    rowY,
    box: {
      id: table.name,
      x,
      y,
      w: width,
      h: height,
      html: [heading, ...lines].join('<br>'),
      style: `border-top: 2px solid ${COLOURS.brass};`,
    },
  };
}

function lastMigration(): string {
  const files = readdirSync(join(here, '../drizzle'))
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();
  return files[files.length - 1].slice(0, 4);
}

function groupBoard(
  group: Group,
  tables: Map<string, TableInfo>,
  groupOf: Map<string, Group>,
  stamp: string,
): { board: Board; size: { w: number; h: number } } {
  const boxes: Box[] = [];
  const rowYs = new Map<string, Map<string, number>>();
  let x = 64;
  let bottom = TOP;
  for (const column of group.columns) {
    let y = TOP;
    let widest = 0;
    for (const name of column) {
      const table = tables.get(name);
      if (!table) throw new Error(`${group.title}: no table ${name}`);
      const laid = cardOf(table, group, groupOf, x, y);
      boxes.push(laid.box);
      rowYs.set(name, laid.rowY);
      y += laid.box.h + STACK_GAP;
      widest = Math.max(widest, laid.box.w);
    }
    bottom = Math.max(bottom, y - STACK_GAP);
    x += widest + COLUMN_GAP;
  }
  const width = Math.max(1440, x - COLUMN_GAP + 64);
  const height = bottom + 64;
  const edges: Edge[] = [];
  for (const column of group.columns) {
    for (const name of column) {
      const table = tables.get(name)!;
      for (const reference of table.references) {
        if (groupOf.get(reference.table) !== group) continue;
        const target = boxes.find((box) => box.id === reference.table)!;
        edges.push({
          from: name,
          to: reference.table,
          name: `${name} to ${reference.table}, by ${reference.column}`,
          fromY: rowYs.get(name)!.get(reference.column),
          toY: target.y + PADDING + HEADER / 2,
        });
      }
    }
  }
  return {
    size: { w: width, h: height },
    board: {
      title: group.title,
      caption: `Data model · up to date to migration ${stamp} · ? nullable · arrows are foreign keys inside the group, brass text ones leave it`,
      lead: group.lead,
      width,
      height,
      boxes,
      edges,
    },
  };
}

function overviewBoard(
  tables: Map<string, TableInfo>,
  groupOf: Map<string, Group>,
  stamp: string,
): { board: Board; size: { w: number; h: number } } {
  const byFile = new Map(GROUPS.map((g) => [g.file, g]));
  const place: Record<string, [number, number]> = {
    DataModelLab: [0, 0],
    DataModelPlans: [0, 1],
    DataModelIdentity: [1, 0],
    DataModelLibrary: [2, 0],
    DataModelRooms: [2, 1],
    DataModelImports: [2, 2],
    DataModelPlanningSupport: [2, 3],
  };
  const width = 360;
  const boxes: Box[] = [];
  const stackBottom = new Map<number, number>();
  for (const group of GROUPS) {
    const [column, row] = place[group.file];
    const names = group.columns.flat();
    const height = PADDING * 2 + HEADER + names.length * ROW;
    const x = 64 + column * (width + 300);
    const y = Math.max(TOP, stackBottom.get(column) ?? TOP);
    void row;
    stackBottom.set(column, y + height + 56);
    boxes.push({
      id: group.file,
      x,
      y,
      w: width,
      h: height,
      html: [
        `<b style="color: ${COLOURS.text}; font-size: 14px; line-height: ${HEADER}px; display: inline-block">${escapeHtml(group.title)}</b>`,
        ...names.map(
          (name) =>
            `<span style="color: ${COLOURS.muted}">${escapeHtml(name)}</span>`,
        ),
      ].join('<br>'),
      style: `border-top: 2px solid ${COLOURS.brass};`,
    });
  }
  const counts = new Map<string, { from: string; to: string; n: number }>();
  for (const table of tables.values()) {
    const from = groupOf.get(table.name);
    if (!from) continue;
    for (const reference of table.references) {
      const to = groupOf.get(reference.table);
      if (!to || to === from) continue;
      const key = `${from.file}>${to.file}`;
      const entry = counts.get(key) ?? { from: from.file, to: to.file, n: 0 };
      entry.n += 1;
      counts.set(key, entry);
    }
  }
  const edges: Edge[] = [...counts.values()].map((entry) => ({
    from: entry.from,
    to: entry.to,
    name: `${byFile.get(entry.from)!.title} to ${byFile.get(entry.to)!.title}, ${entry.n} foreign key${entry.n === 1 ? '' : 's'}`,
  }));
  const height = Math.max(...[...stackBottom.values()]) + 8;
  const boardWidth = 64 + 3 * width + 2 * 300 + 64;
  return {
    size: { w: boardWidth, h: height },
    board: {
      title: 'How the groups refer to each other',
      caption: `Data model · up to date to migration ${stamp} · an arrow is a foreign key from one group to another`,
      lead: 'Nearly everything refers to identities, which is why Identity and access sits in the middle. Each group has its own board, with every table and column.',
      width: boardWidth,
      height,
      boxes,
      edges,
    },
  };
}

const { values } = parseArgs({
  options: { out: { type: 'string' } },
});
if (!values.out) throw new Error('Pass --out <folder>.');
const out = resolve(values.out);
mkdirSync(join(out, 'project'), { recursive: true });

const stamp = lastMigration();
const tables = tablesOf();
const groupOf = new Map<string, Group>();
for (const group of GROUPS) {
  for (const name of group.columns.flat()) groupOf.set(name, group);
}
const missing = [...tables.keys()].filter((name) => !groupOf.has(name));
if (missing.length > 0) {
  throw new Error(
    `Tables in no group of data-model-canvas.ts: ${missing.join(', ')}`,
  );
}

const entries: Record<string, { w: number; h: number; title: string }> = {};
function write(file: string, made: { board: Board; size: { w: number; h: number } }) {
  writeFileSync(join(out, 'project', `${file}.dc.html`), boardMarkup(made.board));
  entries[`${file}.dc.html`] = { ...made.size, title: made.board.title };
}
write('DataModelOverview', overviewBoard(tables, groupOf, stamp));
for (const group of GROUPS) {
  write(group.file, groupBoard(group, tables, groupOf, stamp));
}
writeFileSync(
  join(out, 'canvas-entries.json'),
  JSON.stringify(entries, null, 2) + '\n',
);

const stampFile = join(repositoryRoot, 'docs/canvas-sync.json');
const previous = existsSync(stampFile)
  ? (JSON.parse(readFileSync(stampFile, 'utf8')) as object)
  : {};
writeFileSync(
  stampFile,
  JSON.stringify(
    {
      ...previous,
      dataModel: {
        migration: stamp,
        syncedOn: new Date().toISOString().slice(0, 10),
      },
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Wrote ${Object.keys(entries).length} boards to ${out}; the data model is up to date to migration ${stamp}.`,
);
