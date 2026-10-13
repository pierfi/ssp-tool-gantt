// Pure helpers ported verbatim (behaviour-for-behaviour) from the
// DCLogic class inside "Team Planner.dc.html". No React in here.

import type {
  Member,
  PlannerData,
  Task,
  ParsedEpic,
  ParsedTask,
  TaskType,
} from './types';

// --- ids ---------------------------------------------------------------

export const uid = (p: string): string =>
  p + Math.random().toString(36).slice(2, 8);

// --- date helpers ----------------------------------------------------------

export const pad = (n: number | string): string => String(n).padStart(2, '0');

export const iso = (d: Date): string =>
  d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

export const D = (s: string): Date => {
  const p = String(s).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
};

export const addD = (s: string, n: number): string => {
  const d = D(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};

export const diff = (a: string, b: string): number =>
  Math.round((D(b).getTime() - D(a).getTime()) / 86400000);

export const monday = (s: string): string => {
  const d = D(s);
  const w = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - w);
  return iso(d);
};

export const endOf = (t: { start: string; days: number }): string =>
  addD(t.start, Math.max(1, t.days));

export function isoWeek(s: string): number {
  const d = D(s);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const w1 = new Date(t.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((t.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7,
    )
  );
}

// --- colour ----------------------------------------------------------------

export function nextHue(used: number[]): number {
  const pal = [205, 285, 140, 50, 325, 175, 260, 95, 235, 120, 310, 70];
  const dist = (a: number, b: number) => {
    const dd = Math.abs(a - b) % 360;
    return Math.min(dd, 360 - dd);
  };
  const free = pal.filter((h) => used.every((u) => dist(u, h) >= 34));
  if (free.length) return free[0];
  let best = pal[0];
  let bestGap = -1;
  pal.forEach((h) => {
    const gap = used.length ? Math.min(...used.map((u) => dist(u, h))) : 360;
    if (gap > bestGap) {
      bestGap = gap;
      best = h;
    }
  });
  return best;
}

// --- scheduling ----------------------------------------------------------

/** Resolve "must start after" dependencies by pushing starts forward. Mutates. */
export function norm(tasks: Task[]): Task[] {
  const by: Record<string, Task> = {};
  tasks.forEach((t) => {
    by[t.id] = t;
  });
  for (let i = 0; i < 6; i++) {
    tasks.forEach((t) => {
      (t.deps || []).forEach((id) => {
        const p = by[id];
        if (!p) return;
        if (diff(endOf(p), t.start) < 0) t.start = endOf(p);
      });
    });
  }
  return tasks;
}

export function geom(tasks: Task[], dayW: number) {
  const today = iso(new Date());
  let min = today;
  let max = addD(today, 14);
  tasks.forEach((t) => {
    if (diff(t.start, min) > 0) min = t.start;
    const e = endOf(t);
    if (diff(max, e) > 0) max = e;
  });
  const start = addD(monday(min), -7);
  const total = Math.max(56, diff(start, monday(max)) + 21);
  return { start, total, dayW, leftOf: (s: string) => diff(start, s) * dayW };
}

// --- members -----------------------------------------------------------

export const memberName = (
  members: Member[],
  id: string | null,
): string | null => {
  const m = members.find((x) => x.id === id);
  return m ? m.name : null;
};

export const slug = (s: string | null): string =>
  String(s || '')
    .trim()
    .replace(/\s+/g, '-');

export function resolveMember(
  n: { members: Member[] },
  name: string | null,
): string | null {
  if (!name) return null;
  const found = n.members.find(
    (m) =>
      m.name.toLowerCase() === String(name).toLowerCase().replace(/-/g, ' ') ||
      m.name.toLowerCase() === String(name).toLowerCase(),
  );
  if (found) return found.id;
  const nm: Member = {
    id: uid('m'),
    name: String(name)
      .replace(/-/g, ' ')
      .replace(/^./, (c) => c.toUpperCase()),
    hue: [255, 160, 35, 300, 120, 200][n.members.length % 6],
  };
  n.members.push(nm);
  return nm.id;
}

// --- text parsing ("Incolla epica" / Jira export) ------------------------

export function parseDate(s: string): string {
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return y + '-' + pad(m[2]) + '-' + pad(m[1]);
  }
  return '';
}

export function parse(text: string): { epics: ParsedEpic[]; tasks: ParsedTask[] } {
  const lines = text.split('\n');
  const epics: ParsedEpic[] = [];
  const tasks: ParsedTask[] = [];
  let cur: ParsedEpic | null = null;
  const clean = (s: string) => s.replace(/^[\-*•\s]+/, '').trim();

  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) return;

    let m = line.match(/^[-*•\s]*epic\s*[:\-]\s*(.+)$/i);
    if (m) {
      const rest = m[1].trim();
      const k = rest.match(/^([A-Za-z]+-\d+)\s*[:\-]?\s*(.*)$/);
      cur = {
        id: uid('e'),
        key: k ? k[1].toUpperCase() : '',
        title: (k ? k[2] : rest).trim() || rest,
        hue: 0,
        due: '',
        start: '',
      };
      epics.push(cur);
      return;
    }

    const addTask = (raw2: string, forced?: TaskType) => {
      let rest = raw2.replace(/\t+/g, '  ').trim();
      let assignee: string | null = null;
      let days = 7;
      let startAt: string | null = null;

      const a = rest.match(/@([\p{L}\w.\-]+)/u);
      if (a) {
        assignee = a[1];
        rest = rest.replace(a[0], '').trim();
      }
      const ds = rest.match(
        /(?:^|\s)(?:>|start\s*[:=]\s*)(\d{4}-\d{1,2}-\d{1,2})(?=$|\s)/i,
      );
      if (ds) {
        startAt = parseDate(ds[1]);
        rest = rest.replace(ds[0], ' ').trim();
      }
      const dd = rest.match(/(?:^|\s)(\d{1,2})\s*[dg](?:$|\s)/i);
      if (dd) {
        days = parseInt(dd[1], 10);
        rest = rest.replace(dd[0], ' ').trim();
      }
      let type: TaskType = forced || 'task';
      const tt = rest.match(/\s{2,}(sub-?task|task|bug|story|epic)\s*$/i);
      if (tt && /bug/i.test(tt[1])) type = 'bug';
      if (/\bbug\b/i.test(rest)) type = 'bug';
      rest = rest
        .replace(/\s{2,}(?:sub-?task|task|bug|story|epic)\s*$/i, '')
        .replace(/\s{2,}/g, ' · ')
        .trim();
      const k = rest.match(/^([A-Za-z][A-Za-z0-9]*-\d+)\s*[:\-·|]?\s*(.*)$/);
      const title = (clean(k ? k[2] : rest) || rest)
        .replace(/^[·|\-\s]+/, '')
        .trim();
      tasks.push({
        id: uid('t'),
        epicKey: cur ? cur.id : null,
        key: k ? k[1].toUpperCase() : '',
        title: title || (k ? k[1].toUpperCase() : rest),
        assigneeName: assignee,
        days: Math.max(1, days),
        start: startAt,
        deps: [],
        type,
      });
    };

    m = line.match(/^[-*•\s]*(sub-?task|task|bug|story)\s*[:\-]\s*(.+)$/i);
    if (m) {
      addTask(m[2], /bug/i.test(m[1]) ? 'bug' : 'task');
      return;
    }
    m = line.match(/^[-*•\s]*due\s*date\s*[:\-]\s*(.+)$/i);
    if (m && cur) {
      cur.due = parseDate(m[1]);
      return;
    }
    m = line.match(/^[-*•\s]*start\s*[:\-]\s*(.+)$/i);
    if (m && cur) {
      cur.start = parseDate(m[1]);
      return;
    }
    m = line.match(/^[-*•]\s*(.+)$/);
    if (m) {
      addTask(m[1]);
      return;
    }
    if (/^[A-Za-z][A-Za-z0-9]*-\d+\b/.test(line)) {
      addTask(line);
      return;
    }
  });

  return { epics, tasks };
}

export function serializeEpic(data: PlannerData, id: string): string {
  const e = data.epics.find((x) => x.id === id);
  if (!e) return '';
  const ts = data.tasks
    .filter((t) => t.epicId === id)
    .slice()
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const out = ['epic: ' + ((e.key ? e.key + ' ' : '') + (e.title || '')).trim()];
  if (e.due) out.push('due date: ' + e.due);
  out.push('');
  ts.forEach((t) => {
    const nm = memberName(data.members, t.assignee);
    out.push(
      '- ' +
        ((t.type || 'task') === 'bug' ? 'bug: ' : 'task: ') +
        [
          t.key,
          t.title,
          nm ? '@' + slug(nm) : null,
          t.days + 'd',
          '>' + t.start,
        ]
          .filter(Boolean)
          .join(' '),
    );
  });
  return out.join('\n');
}

// --- inline-style helper -----------------------------------------------

/**
 * Parse a CSS declaration string ("display:flex;gap:8px") into a React
 * style object. Lets the JSX mirror the original .dc.html template's
 * inline styles line-for-line.
 */
export function css(text: string): import('react').CSSProperties {
  const out: Record<string, string> = {};
  text.split(';').forEach((part) => {
    const i = part.indexOf(':');
    if (i < 0) return;
    const prop = part.slice(0, i).trim();
    if (!prop) return;
    const val = part.slice(i + 1).trim();
    const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = val;
  });
  return out as unknown as import('react').CSSProperties;
}
