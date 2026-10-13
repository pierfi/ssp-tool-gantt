import React from 'react';
import type { Draft, Epic, Member, PlannerData, Task, TaskType } from './types';
import {
  addD,
  css,
  D,
  diff,
  endOf,
  geom,
  iso,
  isoWeek,
  monday,
  nextHue,
  norm,
  parse,
  resolveMember,
  serializeEpic,
  uid,
} from './logic';
import {
  DbSync,
  hostedOnClaude,
  loadDayW,
  loadHighlight,
  loadLocal,
  saveDayW,
  saveHighlight,
  saveLocal,
  type SyncStatus,
} from './store';

const DEFAULT_IMPORT =
  'epic: SSP-1234 python end of life eol\n' +
  '- task: ssp-1235 lambda 001 @piero 5d\n' +
  '- task: ssp-1236 lambda 006 @giorgia 5d\n' +
  'start: 2026-09-07\n' +
  'due date: 2026-10-16';

interface State extends PlannerData {
  selected: string | null;
  draft: Draft | null;
  importOpen: boolean;
  importText: string;
  linkFrom: string | null;
  epicEditOpen: boolean;
  epicEditId: string | null;
  epicEditText: string;
  showEpicRows: boolean;
  showDependencies: boolean;
  sync: SyncStatus;
  syncDetail: string;
  /** epic ids highlighted on the board (per viewer) */
  highlight: string[];
  /** open right-click menu on a task bar */
  menu: { taskId: string; x: number; y: number } | null;
}

// --- view-model shapes consumed by render() ---------------------------

interface DayCell {
  left: number;
  width: number;
  num: number;
  line: string;
  headBg: string;
  bodyBg: string;
  fg: string;
}

interface WeekCell {
  left: number;
  width: number;
  label: string;
}

interface BarVM {
  id: string;
  isTask: boolean;
  isBug?: boolean;
  key: string;
  title: string;
  top: number;
  height: number;
  left: number;
  width: number;
  bg: string;
  border: string;
  fg: string;
  keyFg: string;
  weight: string;
  radius: number;
  cursor: string;
  shadow: string;
  onDown: (e: React.PointerEvent) => void;
  onResizeL: (e: React.PointerEvent) => void;
  onResizeR: (e: React.PointerEvent) => void;
  onLink: (e: React.PointerEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onMenu?: (e: React.MouseEvent) => void;
  /** faded because another epic is highlighted */
  dim: boolean;
  linkFg?: string;
  linkBg?: string;
}

interface RowVM {
  rowKey: string;
  h: number;
  label: string;
  sub: string;
  dot: string;
  dotRadius: string;
  weight: string;
  fg: string;
  rowBg: string;
  labelBg: string;
  bars: BarVM[];
}

interface ArrowVM {
  d: string;
  head: string;
  dim: boolean;
}

export class TeamPlanner extends React.Component<Record<string, never>, State> {
  scrollRef: React.RefObject<HTMLDivElement>;
  db: DbSync | null = null;
  scrolled = false;

  constructor(props: Record<string, never>) {
    super(props);
    // Published on claude.ai the board starts empty and fills from the
    // shared DB; locally it keeps using localStorage (and the demo seed).
    const hosted = hostedOnClaude();
    const s = hosted ? null : loadLocal();
    const base = hosted
      ? { dayW: 24, members: [], epics: [], tasks: [] }
      : this.migrate(s && s.tasks ? s : this.seed());
    base.dayW = loadDayW() ?? base.dayW;
    this.state = {
      ...base,
      sync: hosted ? 'connecting' : 'local',
      syncDetail: '',
      highlight: loadHighlight(),
      menu: null,
      selected: null,
      draft: null,
      importOpen: false,
      importText: DEFAULT_IMPORT,
      linkFrom: null,
      epicEditOpen: false,
      epicEditId: null,
      epicEditText: '',
      showEpicRows: true,
      showDependencies: true,
    };
    this.scrollRef = React.createRef<HTMLDivElement>();
  }

  // --- seed / migrate --------------------------------------------------

  migrate(s: Partial<PlannerData> & Record<string, unknown>): PlannerData {
    const dist = (a: number, b: number) => {
      const d = Math.abs(a - b) % 360;
      return Math.min(d, 360 - d);
    };
    const used: number[] = [];
    const epics = (s.epics || []).map((e) => {
      let hue = typeof e.hue === 'number' ? e.hue : nextHue(used);
      if (used.some((u) => dist(u, hue) < 34) || dist(hue, 25) < 20)
        hue = nextHue(used);
      used.push(hue);
      return { ...e, hue };
    });
    const tasks = (s.tasks || []).map((t) => {
      const hint = /\bbug\b/i.test((t.title || '') + ' ' + (t.key || ''));
      const type: TaskType = t.typeSet
        ? t.type || 'task'
        : hint
          ? 'bug'
          : t.type || 'task';
      return { ...t, deps: t.deps || [], type };
    });
    return {
      dayW: typeof s.dayW === 'number' ? s.dayW : 24,
      members: s.members || [],
      epics,
      tasks,
    };
  }

  seed(): PlannerData {
    return {
      dayW: 24,
      members: [
        { id: 'm1', name: 'Piero', hue: 255 },
        { id: 'm2', name: 'Giorgia', hue: 160 },
        { id: 'm3', name: 'Ilaria', hue: 35 },
      ],
      epics: [
        {
          id: 'e0',
          key: 'SSP-1100',
          title: 'platform hardening',
          hue: 200,
          due: '2026-09-11',
        },
        {
          id: 'e1',
          key: 'SSP-1234',
          title: 'python end of life eol',
          hue: 290,
          due: '2026-10-16',
        },
      ],
      tasks: [
        {
          id: 't0',
          epicId: 'e0',
          key: 'SSP-1101',
          title: 'attività precedente',
          assignee: 'm2',
          start: '2026-08-24',
          days: 7,
          deps: [],
          type: 'task',
        },
        {
          id: 't1',
          epicId: 'e1',
          key: 'SSP-1235',
          title: 'lambda 001',
          assignee: 'm1',
          start: '2026-09-07',
          days: 7,
          deps: [],
          type: 'task',
        },
        {
          id: 't2',
          epicId: 'e1',
          key: 'SSP-1236',
          title: 'lambda 006',
          assignee: 'm2',
          start: '2026-09-14',
          days: 7,
          deps: ['t1'],
          type: 'task',
        },
        {
          id: 't3',
          epicId: 'e1',
          key: 'SSP-1237',
          title: 'lambda 012',
          assignee: 'm3',
          start: '2026-09-21',
          days: 10,
          deps: [],
          type: 'task',
        },
      ],
    };
  }

  // --- lifecycle -----------------------------------------------------------

  componentDidMount() {
    if (hostedOnClaude()) this.connectDb();
    else setTimeout(() => this.scrollToday(), 60);
    window.addEventListener('keydown', this.onKey);
  }

  componentWillUnmount() {
    this.db?.close();
    window.removeEventListener('keydown', this.onKey);
  }

  onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.state.menu) this.setState({ menu: null });
  };

  componentDidUpdate(_p: unknown, prev: State) {
    const s = this.state;
    if (s.dayW !== prev.dayW) saveDayW(s.dayW);
    if (s.highlight !== prev.highlight) saveHighlight(s.highlight);
    if (this.db) this.db.push(s);
    else if (s.sync === 'local') saveLocal(s);
  }

  async connectDb() {
    const sync = await DbSync.connect(
      (remote) => {
        this.setState({
          members: remote.members,
          epics: remote.epics,
          tasks: remote.tasks.map((t) => ({ ...t, deps: t.deps || [] })),
        });
        if (!this.scrolled) {
          this.scrolled = true;
          setTimeout(() => this.scrollToday(), 60);
        }
      },
      (sync, detail) => this.setState({ sync, syncDetail: detail || '' }),
    );
    if (sync) {
      this.db = sync;
      return;
    }
    // This view cannot use the DB: fall back to this browser only.
    const s = loadLocal();
    this.setState({
      ...this.migrate(s && s.tasks ? s : {}),
      sync: 'local',
    });
    setTimeout(() => this.scrollToday(), 60);
  }

  // --- state plumbing ----------------------------------------------------

  update(fn: (n: State) => void) {
    this.setState((s) => {
      const n: State = { ...s };
      fn(n);
      n.tasks = norm(n.tasks.map((t) => ({ ...t })));
      return n;
    });
  }

  scrollToday() {
    const el = this.scrollRef.current;
    if (!el) return;
    const l = geom(this.state.tasks, this.state.dayW).leftOf(iso(new Date()));
    el.scrollLeft = Math.max(0, l - el.clientWidth / 2 + 105);
  }

  // --- import / epic editing ------------------------------------------

  runImport() {
    const { epics, tasks } = parse(this.state.importText);
    if (!epics.length && !tasks.length) {
      this.setState({ importOpen: false });
      return;
    }
    this.update((n) => {
      const used = n.epics.map((x) => x.hue);
      epics.forEach((e) => {
        e.hue = nextHue(used);
        used.push(e.hue);
      });
      const cursor = addD(monday(iso(new Date())), 7);
      const byEpic: Record<string, string> = {};
      epics.forEach((e) => {
        byEpic[e.id] = e.start || cursor;
      });
      byEpic['__free'] = addD(monday(iso(new Date())), 7);
      tasks.forEach((t) => {
        const e = epics.find((x) => x.id === t.epicKey) || null;
        let assignee: string | null = null;
        if (t.assigneeName) {
          const found = n.members.find(
            (m) => m.name.toLowerCase() === t.assigneeName!.toLowerCase(),
          );
          if (found) assignee = found.id;
          else {
            const nm: Member = {
              id: uid('m'),
              name:
                t.assigneeName.charAt(0).toUpperCase() + t.assigneeName.slice(1),
              hue: [255, 160, 35, 300, 120][n.members.length % 5],
            };
            n.members.push(nm);
            assignee = nm.id;
          }
        }
        const slot = e ? e.id : '__free';
        const st = t.start || byEpic[slot];
        n.tasks.push({
          id: t.id,
          epicId: e ? e.id : null,
          key: t.key,
          title: t.title,
          assignee,
          start: st,
          days: t.days,
          deps: [],
          type: t.type || 'task',
        });
        byEpic[slot] = addD(st, t.days);
      });
      epics.forEach((e) =>
        n.epics.push({
          id: e.id,
          key: e.key,
          title: e.title,
          hue: e.hue,
          due: e.due,
        }),
      );
      n.importOpen = false;
    });
  }

  saveEpicEdit() {
    const id = this.state.epicEditId;
    if (!id) return;
    const p = parse(this.state.epicEditText);
    const meta = p.epics[0] || null;
    const items = p.tasks.filter(
      (t) => !t.epicKey || !meta || t.epicKey === meta.id,
    );
    this.update((n) => {
      const old = n.tasks.filter((t) => t.epicId === id);
      const byKey: Record<string, Task> = {};
      old.forEach((t) => {
        if (t.key) byKey[t.key.toUpperCase()] = t;
      });
      if (meta)
        n.epics = n.epics.map((e) =>
          e.id === id
            ? {
                ...e,
                key: meta.key || e.key,
                title: meta.title || e.title,
                due: meta.due || e.due,
              }
            : e,
        );
      let cursor =
        (meta && meta.start) ||
        (old.length
          ? old.map((t) => t.start).sort()[0]
          : addD(monday(iso(new Date())), 0));
      const kept: Task[] = [];
      const keptIds: Record<string, boolean> = {};
      items.forEach((t) => {
        const prev = (t.key && byKey[t.key.toUpperCase()]) || null;
        const start = t.start || (prev ? prev.start : cursor);
        const rec: Task = prev
          ? {
              ...prev,
              key: t.key || prev.key,
              title: t.title || prev.title,
              assignee: t.assigneeName
                ? resolveMember(n, t.assigneeName)
                : prev.assignee,
              start,
              days: Math.max(1, t.days),
              type: (t.type || prev.type || 'task') as TaskType,
              typeSet: true,
            }
          : {
              id: uid('t'),
              epicId: id,
              key: t.key,
              title: t.title,
              assignee: resolveMember(n, t.assigneeName),
              start,
              days: Math.max(1, t.days),
              deps: [],
              type: (t.type || 'task') as TaskType,
              typeSet: true,
            };
        cursor = addD(rec.start, rec.days);
        keptIds[rec.id] = true;
        kept.push(rec);
      });
      const gone = old.filter((t) => !keptIds[t.id]).map((t) => t.id);
      const others = n.tasks.filter(
        (t) => t.epicId !== id && gone.indexOf(t.id) < 0,
      );
      n.tasks = [...others, ...kept].map((t) => ({
        ...t,
        deps: (t.deps || []).filter((d) => gone.indexOf(d) < 0),
      }));
      if (n.selected && gone.indexOf(n.selected) >= 0) {
        n.selected = null;
        n.draft = null;
      }
      n.epicEditOpen = false;
      n.epicEditId = null;
    });
  }

  // --- linking / drag ------------------------------------------------

  linkTo(id: string): boolean {
    const from = this.state.linkFrom;
    if (!from || from === id) return false;
    this.update((n) => {
      n.tasks = n.tasks.map((x) =>
        x.id === id && !(x.deps || []).includes(from)
          ? { ...x, deps: [...(x.deps || []), from] }
          : x,
      );
      n.linkFrom = null;
    });
    return true;
  }

  startDrag(e: React.PointerEvent, task: Task, mode: 'move' | 'l' | 'r') {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (this.state.linkFrom) {
      this.linkTo(task.id);
      return;
    }
    const x0 = e.clientX;
    const s0 = task.start;
    const d0 = task.days;
    const id = task.id;
    const dayW = this.state.dayW;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dd = Math.round((ev.clientX - x0) / dayW);
      if (Math.abs(ev.clientX - x0) > 3) moved = true;
      let target: string | null = null;
      if (mode === 'move') {
        const el = document.elementFromPoint(
          ev.clientX,
          ev.clientY,
        ) as HTMLElement | null;
        const row =
          el && el.closest
            ? (el.closest('[data-row]') as HTMLElement | null)
            : null;
        if (row && row.dataset.row && row.dataset.row.indexOf('mem:') === 0)
          target = row.dataset.row.slice(4);
      }
      this.update((n) => {
        n.tasks = n.tasks.map((t) => {
          if (t.id !== id) return t;
          const u = { ...t };
          if (mode === 'move') {
            u.start = addD(s0, dd);
            if (target !== null) u.assignee = target || null;
          }
          if (mode === 'r') u.days = Math.max(1, d0 + dd);
          if (mode === 'l') {
            const nd = Math.max(1, d0 - dd);
            u.start = addD(s0, d0 - nd);
            u.days = nd;
          }
          return u;
        });
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) this.select(id);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // --- epic highlight ----------------------------------------------

  toggleHighlight(epicId: string) {
    this.setState((st) => ({
      highlight: st.highlight.includes(epicId)
        ? st.highlight.filter((x) => x !== epicId)
        : [...st.highlight, epicId],
    }));
  }

  // --- task context menu -------------------------------------------

  buildMenu() {
    const s = this.state;
    const t = s.menu && s.tasks.find((x) => x.id === s.menu!.taskId);
    if (!s.menu || !t) return null;
    const close = () => this.setState({ menu: null });
    const epic = s.epics.find((e) => e.id === t.epicId);
    const people = [
      ...s.members.map((m) => ({
        id: m.id as string | null,
        name: m.name,
        dot: 'oklch(0.68 0.12 ' + m.hue + ')',
      })),
      { id: null, name: 'Non assegnata', dot: '#dcd8d1' },
    ];
    // Rough height so the menu opens upwards near the bottom edge.
    const estH = 64 + people.length * 29 + (epic ? 58 : 29);
    return {
      left: Math.max(8, Math.min(s.menu.x, window.innerWidth - 228)),
      top:
        s.menu.y + estH > window.innerHeight
          ? Math.max(8, s.menu.y - estH)
          : s.menu.y,
      heading: (t.key ? t.key + ' ' : '') + t.title,
      close,
      people: people.map((p) => ({
        ...p,
        current: (t.assignee || null) === p.id,
        onPick: () => {
          close();
          if ((t.assignee || null) !== p.id) this.assign(t.id, p.id);
        },
      })),
      onOpen: () => {
        close();
        this.select(t.id);
      },
      epicAction: epic
        ? {
            label: s.highlight.includes(epic.id)
              ? 'Togli evidenza a ' + (epic.key || epic.title)
              : 'Evidenzia ' + (epic.key || epic.title),
            run: () => {
              close();
              this.toggleHighlight(epic.id);
            },
          }
        : null,
    };
  }

  assign(taskId: string, memberId: string | null) {
    this.update((n) => {
      n.tasks = n.tasks.map((t) =>
        t.id === taskId ? { ...t, assignee: memberId } : t,
      );
      // keep an open detail panel in step with the new assignee
      if (n.draft && n.draft.id === taskId)
        n.draft = { ...n.draft, assignee: memberId || '' };
    });
  }

  // --- selection / draft --------------------------------------------

  select(id: string | null) {
    const t = this.state.tasks.find((x) => x.id === id);
    this.setState({ selected: id, draft: t ? this.snapshot(id) : null });
  }

  snapshot(id: string | null): Draft | null {
    const t = this.state.tasks.find((x) => x.id === id);
    return t
      ? {
          id: t.id,
          key: t.key,
          title: t.title,
          epicId: t.epicId || '',
          assignee: t.assignee || '',
          start: t.start,
          days: t.days,
          type: t.type || 'task',
        }
      : null;
  }

  setDraft(k: keyof Draft, val: string) {
    this.setState((st) => {
      const b =
        st.draft && st.draft.id === st.selected
          ? st.draft
          : this.snapshot(st.selected);
      if (!b) return null;
      return { draft: { ...b, [k]: val } };
    });
  }

  saveDraft() {
    const d = this.state.draft;
    if (!d) return;
    this.update((n) => {
      n.tasks = n.tasks.map((t) =>
        t.id === d.id
          ? {
              ...t,
              key: d.key,
              title: d.title,
              epicId: d.epicId || null,
              assignee: d.assignee || null,
              start: d.start,
              days: Math.max(1, parseInt(String(d.days), 10) || 1),
              type: (d.type || 'task') as TaskType,
              typeSet: true,
            }
          : t,
      );
    });
  }

  // --- view model --------------------------------------------------------

  buildView() {
    const s = this.state;
    const showEpics = s.showEpicRows;
    const showDeps = s.showDependencies;
    const g = geom(s.tasks, s.dayW);
    const dayW = s.dayW;
    const today = iso(new Date());
    const ROW = 44;
    const EPICROW = 38;

    const days: DayCell[] = [];
    const weeks: WeekCell[] = [];
    for (let i = 0; i < g.total; i++) {
      const ds = addD(g.start, i);
      const d = D(ds);
      const wd = d.getDay();
      const we = wd === 0 || wd === 6;
      days.push({
        left: i * dayW,
        width: dayW,
        num: d.getDate(),
        line: wd === 1 ? '#ddd9d2' : '#f2efea',
        headBg: we ? '#f6f4f0' : '#fff',
        bodyBg: we ? 'rgba(0,0,0,0.022)' : 'transparent',
        fg: ds === today ? '#d93a3a' : we ? '#b3afa7' : '#8a8781',
      });
      if (wd === 1 || i === 0) {
        const mn = d.toLocaleDateString('it-IT', { month: 'short' });
        weeks.push({
          left: i * dayW,
          width: Math.min(7, g.total - i) * dayW,
          label: 'W' + isoWeek(ds) + ' · ' + d.getDate() + ' ' + mn,
        });
      }
    }

    // Highlighted epics that still exist; with none, nothing is dimmed.
    const hl = s.highlight.filter((id) => s.epics.some((e) => e.id === id));
    const dimEpic = (epicId: string | null) =>
      hl.length > 0 && !(epicId && hl.includes(epicId));

    const epicCol = (h: number) => ({
      bar: 'oklch(0.93 0.045 ' + h + ')',
      bd: 'oklch(0.72 0.10 ' + h + ')',
      dot: 'oklch(0.66 0.13 ' + h + ')',
      fg: 'oklch(0.35 0.09 ' + h + ')',
    });

    const mkBar = (t: Task, epic: Epic | undefined): BarVM => {
      const isBug = t.type === 'bug';
      const c = isBug
        ? {
            bar: 'oklch(0.93 0.055 25)',
            bd: 'oklch(0.60 0.19 25)',
            dot: 'oklch(0.55 0.20 25)',
            fg: 'oklch(0.42 0.17 25)',
          }
        : epic
          ? epicCol(epic.hue)
          : { bar: '#f1efeb', bd: '#b8b3aa', dot: '#9a958c', fg: '#4a4842' };
      const sel = s.selected === t.id;
      const linking = s.linkFrom === t.id;
      return {
        id: t.id,
        isTask: true,
        isBug,
        key: t.key,
        title: t.title,
        top: 8,
        height: ROW - 18,
        left: g.leftOf(t.start),
        width: Math.max(dayW * Math.max(1, t.days) - 3, 26),
        bg: c.bar,
        border: linking ? '#b6803f' : sel ? '#1c1b19' : c.bd,
        fg: c.fg,
        keyFg: c.bd,
        weight: '500',
        radius: 5,
        cursor: 'grab',
        shadow: sel ? '0 0 0 2px rgba(28,27,25,0.12)' : 'none',
        onDown: (e) => this.startDrag(e, t, 'move'),
        onResizeL: (e) => this.startDrag(e, t, 'l'),
        onResizeR: (e) => this.startDrag(e, t, 'r'),
        linkFg: linking ? '#fff' : c.bd,
        linkBg: linking ? '#b6803f' : 'rgba(255,255,255,0.55)',
        onLink: (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          this.setState((st) => ({
            linkFrom: st.linkFrom === t.id ? null : t.id,
          }));
        },
        onClick: (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          if (!this.linkTo(t.id)) this.select(t.id);
        },
        onMenu: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.setState({
            menu: { taskId: t.id, x: e.clientX, y: e.clientY },
            linkFrom: null,
          });
        },
        dim: dimEpic(t.epicId),
      };
    };

    const rows: RowVM[] = [];
    const rowY: Record<number, number> = {};
    const barGeom: Record<
      string,
      { x1: number; x2: number; cy: number; row: number }
    > = {};

    if (showEpics)
      s.epics.forEach((e) => {
        const ts = s.tasks.filter((t) => t.epicId === e.id);
        const bars: BarVM[] = [];
        if (ts.length) {
          let st = ts[0].start;
          let en = endOf(ts[0]);
          ts.forEach((t) => {
            if (diff(t.start, st) > 0) st = t.start;
            if (diff(en, endOf(t)) > 0) en = endOf(t);
          });
          const c = epicCol(e.hue);
          bars.push({
            id: 'epic-' + e.id,
            isTask: false,
            key: e.key,
            title: e.title,
            top: 7,
            height: EPICROW - 14,
            left: g.leftOf(st),
            width: Math.max(diff(st, en) * dayW - 3, 40),
            bg: 'oklch(0.97 0.02 ' + e.hue + ')',
            border: c.dot,
            fg: c.fg,
            keyFg: c.dot,
            weight: '600',
            radius: 3,
            cursor: 'default',
            shadow: 'none',
            onDown: () => {},
            onClick: () => {},
            onResizeL: () => {},
            onResizeR: () => {},
            onLink: () => {},
            dim: dimEpic(e.id),
          });
        }
        rows.push({
          rowKey: 'epic:' + e.id,
          h: EPICROW,
          label: e.title,
          sub: e.key + (e.due ? ' · due ' + e.due : ''),
          dot: epicCol(e.hue).dot,
          dotRadius: '2px',
          weight: '600',
          fg: '#1c1b19',
          rowBg: 'rgba(0,0,0,0.012)',
          labelBg: '#fdfdfc',
          bars,
        });
      });

    const memRows: { id: string; name: string; hue: number | null }[] = [
      ...s.members.map((m) => ({ id: m.id, name: m.name, hue: m.hue })),
      { id: '', name: 'Non assegnate', hue: null },
    ];
    memRows.forEach((m) => {
      const bars = s.tasks
        .filter((t) => (t.assignee || '') === m.id)
        .map((t) =>
          mkBar(
            t,
            s.epics.find((e) => e.id === t.epicId),
          ),
        );
      const BARH = 26;
      const GUT = 4;
      const laneEnd: number[] = [];
      bars
        .slice()
        .sort((a, b) => a.left - b.left)
        .forEach((b) => {
          let lane = laneEnd.findIndex((x) => x <= b.left - 2);
          if (lane < 0) lane = laneEnd.length;
          laneEnd[lane] = b.left + b.width;
          b.height = BARH;
          b.top = 6 + lane * (BARH + GUT);
        });
      const lanes = Math.max(1, laneEnd.length);
      const rowH = Math.max(ROW, lanes * (BARH + GUT) + 8);
      bars.forEach((b) => {
        barGeom[b.id] = {
          x1: b.left,
          x2: b.left + b.width,
          cy: b.top + b.height / 2,
          row: rows.length,
        };
      });
      rows.push({
        rowKey: 'mem:' + m.id,
        h: rowH,
        label: m.name,
        sub: bars.length ? bars.length + ' attività' : '—',
        dot: m.hue === null ? '#dcd8d1' : 'oklch(0.68 0.12 ' + m.hue + ')',
        dotRadius: '50%',
        weight: '500',
        fg: m.hue === null ? '#8a8781' : '#1c1b19',
        rowBg: 'transparent',
        labelBg: '#fff',
        bars,
      });
    });

    let y = 0;
    rows.forEach((r, i) => {
      rowY[i] = y;
      y += r.h + 1;
    });
    const bodyH = y;

    const arrows: ArrowVM[] = [];
    if (showDeps)
      s.tasks.forEach((t) => {
        (t.deps || []).forEach((pid) => {
          const p = s.tasks.find((x) => x.id === pid);
          if (!p) return;
          const a = barGeom[p.id];
          const b = barGeom[t.id];
          if (!a || !b) return;
          const y1 = rowY[a.row] + a.cy;
          const y2 = rowY[b.row] + b.cy;
          const x1 = a.x2;
          const x2 = b.x1;
          const gap = 8;
          let d: string;
          if (x2 - x1 >= gap * 2) {
            const mx = x2 - gap;
            d =
              'M' + x1 + ',' + y1 + ' L' + mx + ',' + y1 + ' L' + mx + ',' + y2 +
              ' L' + (x2 - 5) + ',' + y2;
          } else {
            const ch = Math.max(x1 + gap, x2 - gap);
            const my = (y1 + y2) / 2;
            d =
              Math.abs(y1 - y2) < 1
                ? 'M' + x1 + ',' + y1 + ' L' + (x2 - 5) + ',' + y2
                : 'M' + x1 + ',' + y1 + ' L' + ch + ',' + y1 + ' L' + ch + ',' +
                  my + ' L' + ch + ',' + y2 + ' L' + (x2 - 5) + ',' + y2;
          }
          const head =
            x2 + ',' + y2 + ' ' + (x2 - 6) + ',' + (y2 - 4.5) + ' ' +
            (x2 - 6) + ',' + (y2 + 4.5);
          arrows.push({
            d,
            head,
            dim: dimEpic(p.epicId) && dimEpic(t.epicId),
          });
        });
      });

    const sel = s.tasks.find((t) => t.id === s.selected) || null;
    const dr =
      s.draft && sel && s.draft.id === sel.id
        ? s.draft
        : sel
          ? this.snapshot(sel.id)
          : null;
    const dirty = !!(
      sel &&
      dr &&
      ((dr.type || 'task') !== (sel.type || 'task') ||
        dr.key !== sel.key ||
        dr.title !== sel.title ||
        (dr.epicId || '') !== (sel.epicId || '') ||
        (dr.assignee || '') !== (sel.assignee || '') ||
        dr.start !== sel.start ||
        String(dr.days) !== String(sel.days))
    );
    const nowFrac =
      (new Date().getHours() * 60 + new Date().getMinutes()) / 1440;
    const nowLeft = 210 + g.leftOf(today) + nowFrac * dayW;

    const fallbackSel: Draft = {
      id: '',
      key: '',
      title: '',
      epicId: '',
      assignee: '',
      start: '',
      days: 1,
      type: 'task',
    };

    return {
      days,
      weeks,
      rows,
      arrows,
      bodyH,
      gridW: g.total * dayW,
      canvasW: 210 + g.total * dayW,
      nowLeft,
      nowLabelLeft: nowLeft - 2,
      zoomLabel: dayW + 'px/g',
      zoomIn: () =>
        this.setState((st) => ({ dayW: Math.min(48, st.dayW + 4) })),
      zoomOut: () =>
        this.setState((st) => ({ dayW: Math.max(10, st.dayW - 4) })),
      scrollToday: () => this.scrollToday(),
      showEpicRows: showEpics,
      showDependencies: showDeps,
      toggleEpicRows: () =>
        this.setState((st) => ({ showEpicRows: !st.showEpicRows })),
      toggleDeps: () =>
        this.setState((st) => ({ showDependencies: !st.showDependencies })),
      openImport: () => this.setState({ importOpen: true }),
      closeImport: () => this.setState({ importOpen: false }),
      importOpen: s.importOpen,
      importText: s.importText,
      setImportText: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
        this.setState({ importText: e.target.value }),
      runImport: () => this.runImport(),
      epicEditOpen: !!s.epicEditOpen,
      epicEditText: s.epicEditText || '',
      epicEditKey: (() => {
        const e = s.epics.find((x) => x.id === s.epicEditId);
        return e ? (e.key ? e.key + ' ' : '') + e.title : '';
      })(),
      epicEditHint:
        'Le righe rimosse eliminano l’attività; quelle nuove la creano.',
      setEpicEditText: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
        this.setState({ epicEditText: e.target.value }),
      closeEpicEdit: () =>
        this.setState({ epicEditOpen: false, epicEditId: null }),
      saveEpicEdit: () => this.saveEpicEdit(),
      memberRows: s.members.map((m) => ({
        id: m.id,
        name: m.name,
        dot: 'oklch(0.68 0.12 ' + m.hue + ')',
        onRename: (e: React.ChangeEvent<HTMLInputElement>) => {
          const val = e.target.value;
          this.update((n) => {
            n.members = n.members.map((x) =>
              x.id === m.id ? { ...x, name: val } : x,
            );
          });
        },
        onRemove: () =>
          this.update((n) => {
            n.members = n.members.filter((x) => x.id !== m.id);
            n.tasks = n.tasks.map((t) =>
              t.assignee === m.id ? { ...t, assignee: null } : t,
            );
          }),
      })),
      addMember: () =>
        this.update((n) => {
          n.members = [
            ...n.members,
            {
              id: uid('m'),
              name: 'Nuovo membro',
              hue: [255, 160, 35, 300, 120, 200][n.members.length % 6],
            },
          ];
        }),
      menu: this.buildMenu(),
      highlightCount: hl.length,
      clearHighlight: () => this.setState({ highlight: [] }),
      epicCards: s.epics.map((e) => {
        const ts = s.tasks.filter((t) => t.epicId === e.id);
        const on = hl.includes(e.id);
        return {
          id: e.id,
          highlighted: on,
          cardBd: on ? epicCol(e.hue).dot : '#eeebe6',
          cardBg: on ? 'oklch(0.97 0.02 ' + e.hue + ')' : '#fdfdfc',
          onToggle: () => this.toggleHighlight(e.id),
          key: e.key || '—',
          title: e.title,
          dot: epicCol(e.hue).dot,
          meta: ts.length + ' task' + (e.due ? ' · due ' + e.due : ''),
          onEdit: () =>
            this.setState({
              epicEditOpen: true,
              epicEditId: e.id,
              epicEditText: serializeEpic(this.state, e.id),
            }),
          onRemove: () =>
            this.update((n) => {
              n.epics = n.epics.filter((x) => x.id !== e.id);
              n.tasks = n.tasks.filter((t) => t.epicId !== e.id);
            }),
          onAddTask: () => {
            const id = uid('t');
            this.update((n) => {
              const last = n.tasks
                .filter((t) => t.epicId === e.id)
                .map((t) => endOf(t))
                .sort()
                .pop();
              n.tasks = [
                ...n.tasks,
                {
                  id,
                  epicId: e.id,
                  key: '',
                  title: 'Nuova attività',
                  assignee: null,
                  start: last || monday(today),
                  days: 7,
                  deps: [],
                  type: 'task',
                },
              ];
            });
            setTimeout(() => this.select(id), 0);
          },
        };
      }),
      hasSelection: !!sel,
      sel: dr || fallbackSel,
      setType: (e: React.ChangeEvent<HTMLSelectElement>) =>
        this.setDraft('type', e.target.value),
      dirty,
      saveLabel: dirty ? 'Salva' : 'Salvato',
      saveBg: dirty ? '#1c1b19' : '#f3f1ed',
      saveFg: dirty ? '#fff' : '#a8a49c',
      saveBd: dirty ? '#1c1b19' : '#e6e3dd',
      saveCursor: dirty ? 'pointer' : 'default',
      onSave: () => this.saveDraft(),
      onRevert: () => this.select(s.selected),
      epicOptions: [
        { id: '', name: '— nessuna epica (standalone)' },
        ...s.epics.map((e) => ({
          id: e.id,
          name: (e.key ? e.key + ' ' : '') + e.title,
        })),
      ],
      standaloneCount: s.tasks.filter(
        (t) => !t.epicId || !s.epics.some((e) => e.id === t.epicId),
      ).length,
      addStandalone: () => {
        const id = uid('t');
        this.update((n) => {
          n.tasks = [
            ...n.tasks,
            {
              id,
              epicId: null,
              key: '',
              title: 'Nuova attività',
              assignee: null,
              start: monday(today),
              days: 3,
              deps: [],
              type: 'task',
            },
          ];
        });
        setTimeout(() => this.select(id), 0);
      },
      assigneeOptions: [
        { id: '', name: '— non assegnata' },
        ...s.members.map((m) => ({ id: m.id, name: m.name })),
      ],
      selDeps: sel
        ? (sel.deps || []).map((pid) => {
            const p = s.tasks.find((x) => x.id === pid);
            return {
              id: pid,
              name: p ? (p.key ? p.key + ' ' : '') + p.title : '?',
              onRemove: () =>
                this.update((n) => {
                  n.tasks = n.tasks.map((t) =>
                    t.id === sel.id
                      ? { ...t, deps: t.deps.filter((d) => d !== pid) }
                      : t,
                  );
                }),
            };
          })
        : [],
      depHint: s.linkFrom
        ? 'Modalità collegamento attiva: clicca l’attività successiva.'
        : 'Usa ⇢ su una barra, poi clicca la successiva.',
      clearSelection: () => this.setState({ selected: null }),
      setKey: (e: React.ChangeEvent<HTMLInputElement>) =>
        this.setDraft('key', e.target.value),
      setTitle: (e: React.ChangeEvent<HTMLInputElement>) =>
        this.setDraft('title', e.target.value),
      setEpic: (e: React.ChangeEvent<HTMLSelectElement>) =>
        this.setDraft('epicId', e.target.value),
      setAssignee: (e: React.ChangeEvent<HTMLSelectElement>) =>
        this.setDraft('assignee', e.target.value),
      setStart: (e: React.ChangeEvent<HTMLInputElement>) =>
        this.setDraft('start', e.target.value),
      setDays: (e: React.ChangeEvent<HTMLInputElement>) =>
        this.setDraft('days', e.target.value),
      deleteTask: () =>
        this.update((n) => {
          n.tasks = n.tasks
            .filter((t) => t.id !== s.selected)
            .map((t) => ({
              ...t,
              deps: (t.deps || []).filter((d) => d !== s.selected),
            }));
          n.selected = null;
        }),
    };
  }

  // --- render ----------------------------------------------------------

  render() {
    const v = this.buildView();
    const mono = css('font-family:ui-monospace,Menlo,monospace');

    return (
      <div
        style={css(
          'display:flex;flex-direction:column;height:100%;background:#faf9f7;color:#1c1b19;font-size:13px',
        )}
      >
        {/* ---- header ---- */}
        <div
          style={css(
            'display:flex;align-items:center;gap:14px;padding:10px 16px;border-bottom:1px solid #e6e3dd;background:#fff;flex:0 0 auto',
          )}
        >
          <div style={css('font-size:15px;font-weight:600;letter-spacing:-0.01em')}>
            Team Planner
          </div>
          <div
            style={css(
              "font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11px;color:#8a8781;text-transform:uppercase;letter-spacing:0.08em",
            )}
          >
            pianificazione &amp; priorità
          </div>
          <SyncBadge status={this.state.sync} detail={this.state.syncDetail} />
          <div style={css('flex:1')} />
          <div style={css('display:flex;align-items:center;gap:10px')}>
            <label
              style={css(
                'display:flex;align-items:center;gap:5px;font-size:11px;color:#8a8781;cursor:pointer;user-select:none',
              )}
            >
              <input
                type="checkbox"
                checked={v.showEpicRows}
                onChange={v.toggleEpicRows}
              />
              righe epiche
            </label>
            <label
              style={css(
                'display:flex;align-items:center;gap:5px;font-size:11px;color:#8a8781;cursor:pointer;user-select:none',
              )}
            >
              <input
                type="checkbox"
                checked={v.showDependencies}
                onChange={v.toggleDeps}
              />
              dipendenze
            </label>
          </div>
          <div style={css('display:flex;align-items:center;gap:6px')}>
            <button
              onClick={v.zoomOut}
              style={css(
                'width:28px;height:28px;border:1px solid #ddd9d2;background:#fff;border-radius:6px;cursor:pointer;font-size:15px;line-height:1;color:#54524d',
              )}
            >
              −
            </button>
            <div
              style={css(
                'font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#8a8781;width:52px;text-align:center',
              )}
            >
              {v.zoomLabel}
            </div>
            <button
              onClick={v.zoomIn}
              style={css(
                'width:28px;height:28px;border:1px solid #ddd9d2;background:#fff;border-radius:6px;cursor:pointer;font-size:15px;line-height:1;color:#54524d',
              )}
            >
              +
            </button>
          </div>
          <button
            onClick={v.scrollToday}
            style={css(
              'height:28px;padding:0 12px;border:1px solid #ddd9d2;background:#fff;border-radius:6px;cursor:pointer;color:#54524d',
            )}
          >
            Oggi
          </button>
          <button
            onClick={v.openImport}
            style={css(
              'height:28px;padding:0 14px;border:1px solid #1c1b19;background:#1c1b19;color:#fff;border-radius:6px;cursor:pointer;font-weight:500',
            )}
          >
            Incolla epica
          </button>
        </div>

        {/* ---- body ---- */}
        <div style={css('display:flex;flex:1;min-height:0')}>
          {/* left rail */}
          <div
            style={css(
              'width:270px;flex:0 0 270px;border-right:1px solid #e6e3dd;background:#fff;overflow-y:auto;padding:16px',
            )}
          >
            <div
              style={css(
                'font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#8a8781;margin-bottom:10px',
              )}
            >
              Team
            </div>
            <div
              style={css(
                'display:flex;flex-direction:column;gap:6px;margin-bottom:8px',
              )}
            >
              {v.memberRows.map((m) => (
                <div
                  key={m.id}
                  style={css('display:flex;align-items:center;gap:8px')}
                >
                  <div
                    style={css(
                      `width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:${m.dot}`,
                    )}
                  />
                  <input
                    value={m.name}
                    onChange={m.onRename}
                    style={css(
                      'flex:1;min-width:0;border:1px solid transparent;background:transparent;padding:5px 6px;border-radius:5px;font-size:13px;color:#1c1b19',
                    )}
                  />
                  <button
                    onClick={m.onRemove}
                    title="Rimuovi"
                    style={css(
                      'width:22px;height:22px;border:none;background:transparent;color:#b3afa7;cursor:pointer;font-size:14px;line-height:1',
                    )}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={v.addMember}
              style={css(
                'width:100%;padding:7px;border:1px dashed #ddd9d2;background:#fff;border-radius:6px;cursor:pointer;color:#8a8781',
              )}
            >
              + Aggiungi membro
            </button>

            <div style={css('height:1px;background:#eeebe6;margin:20px 0')} />

            <div
              style={css(
                'display:flex;align-items:baseline;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#8a8781;margin-bottom:10px',
              )}
            >
              <span>Epiche</span>
              {v.highlightCount > 0 && (
                <button
                  onClick={v.clearHighlight}
                  style={css(
                    'margin-left:auto;border:none;background:transparent;padding:0;cursor:pointer;color:#3d5a80;font-size:10.5px;font-weight:500;letter-spacing:0;text-transform:none',
                  )}
                >
                  Mostra tutte ({v.highlightCount} evidenziate)
                </button>
              )}
            </div>
            <div style={css('display:flex;flex-direction:column;gap:8px')}>
              {v.epicCards.map((e) => (
                <div
                  key={e.id}
                  onClick={e.onToggle}
                  title={
                    e.highlighted
                      ? 'Clic per togliere l’evidenza'
                      : 'Clic per evidenziare sul Gantt'
                  }
                  style={css(
                    `border:1px solid ${e.cardBd};border-radius:8px;padding:10px;background:${e.cardBg};cursor:pointer`,
                  )}
                >
                  <div
                    style={css('display:flex;align-items:flex-start;gap:8px')}
                  >
                    <div
                      style={css(
                        `width:8px;height:8px;border-radius:2px;margin-top:4px;flex:0 0 auto;background:${e.dot}`,
                      )}
                    />
                    <div style={css('flex:1;min-width:0')}>
                      <div
                        style={css(
                          'font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#8a8781;letter-spacing:0.04em',
                        )}
                      >
                        {e.key}
                      </div>
                      <div
                        style={css(
                          'font-size:12.5px;line-height:1.35;text-wrap:pretty;margin-top:2px',
                        )}
                      >
                        {e.title}
                      </div>
                      <div
                        style={css('font-size:11px;color:#8a8781;margin-top:5px')}
                      >
                        {e.meta}
                      </div>
                    </div>
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        e.onRemove();
                      }}
                      title="Elimina epica"
                      style={css(
                        'width:20px;height:20px;border:none;background:transparent;color:#b3afa7;cursor:pointer;font-size:14px;line-height:1',
                      )}
                    >
                      ×
                    </button>
                  </div>
                  <div
                    onClick={(ev) => ev.stopPropagation()}
                    style={css('display:flex;gap:6px;margin-top:8px')}
                  >
                    <button
                      onClick={e.onEdit}
                      style={css(
                        'flex:1;padding:5px;border:1px solid #ddd9d2;background:#fff;border-radius:5px;cursor:pointer;color:#1c1b19;font-size:11.5px;font-weight:500',
                      )}
                    >
                      edit
                    </button>
                    <button
                      onClick={e.onAddTask}
                      style={css(
                        'flex:1;padding:5px;border:1px solid #eeebe6;background:#fff;border-radius:5px;cursor:pointer;color:#54524d;font-size:11.5px',
                      )}
                    >
                      + task
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={v.addStandalone}
              style={css(
                'margin-top:10px;width:100%;padding:7px;border:1px dashed #ddd9d2;background:#fff;border-radius:6px;cursor:pointer;color:#8a8781',
              )}
            >
              + Attività senza epica
            </button>
            <div style={css('font-size:11px;color:#a8a49c;margin-top:6px')}>
              {v.standaloneCount} attività standalone (bug, supporto, sviluppo)
            </div>

            <div
              style={css(
                'margin-top:18px;font-size:11px;line-height:1.5;color:#a8a49c;text-wrap:pretty',
              )}
            >
              Trascina una barra per spostarla o riassegnarla; i bordi la
              ridimensionano. L&apos;icona ⇢ crea un vincolo «dopo».
            </div>
          </div>

          {/* timeline */}
          <div
            ref={this.scrollRef}
            style={css(
              'flex:1;min-width:0;overflow:auto;position:relative;background:#faf9f7',
            )}
          >
            {this.state.tasks.length === 0 && this.state.sync !== 'connecting' && (
              <div style={css('position:sticky;left:0;top:0;height:0;z-index:5')}>
                <div
                  style={css(
                    'position:absolute;top:140px;left:0;right:0;display:flex;justify-content:center;pointer-events:none',
                  )}
                >
                  <div
                    style={css(
                      'max-width:340px;padding:14px 18px;border:1px dashed #ddd9d2;border-radius:8px;background:#fff;color:#54524d;font-size:12.5px;line-height:1.5;text-align:center',
                    )}
                  >
                    Nessuna attività pianificata. Usa <b>Incolla epica</b> per
                    importare epiche e attività, oppure <b>+ Attività senza
                    epica</b> per crearne una.
                  </div>
                </div>
              </div>
            )}
            <div style={css(`min-width:${v.canvasW}px`)}>
              {/* sticky column header */}
              <div
                style={css(
                  'position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid #e6e3dd',
                )}
              >
                <div style={css('display:flex')}>
                  <div
                    style={css(
                      'box-sizing:border-box;position:sticky;left:0;z-index:2;width:210px;flex:0 0 210px;background:#fff;border-right:1px solid #e6e3dd;padding:8px 12px;display:flex;flex-direction:column;justify-content:flex-end',
                    )}
                  >
                    <div
                      style={css(
                        'font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#8a8781',
                      )}
                    >
                      Assegnatario
                    </div>
                  </div>
                  <div
                    style={css(
                      `position:relative;flex:0 0 auto;width:${v.gridW}px;height:52px`,
                    )}
                  >
                    {v.weeks.map((w, i) => (
                      <div
                        key={i}
                        style={css(
                          `position:absolute;top:0;height:26px;left:${w.left}px;width:${w.width}px;border-left:1px solid #e6e3dd;display:flex;align-items:center;padding-left:6px;overflow:hidden;white-space:nowrap;font-size:11px;color:#54524d`,
                        )}
                      >
                        {w.label}
                      </div>
                    ))}
                    {v.days.map((d, i) => (
                      <div
                        key={i}
                        style={css(
                          `position:absolute;top:26px;height:26px;left:${d.left}px;width:${d.width}px;border-left:1px solid ${d.line};background:${d.headBg};display:flex;align-items:center;justify-content:center;font-size:9.5px;color:${d.fg};overflow:hidden`,
                        )}
                      >
                        {d.num}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* grid body */}
              <div style={css('position:relative')}>
                <div
                  style={css(
                    `position:absolute;top:0;bottom:0;left:210px;width:${v.gridW}px;z-index:0`,
                  )}
                >
                  {v.days.map((d, i) => (
                    <div
                      key={i}
                      style={css(
                        `position:absolute;top:0;bottom:0;left:${d.left}px;width:${d.width}px;border-left:1px solid ${d.line};background:${d.bodyBg}`,
                      )}
                    />
                  ))}
                </div>

                <div style={css('position:relative;z-index:1')}>
                  {v.rows.map((r) => (
                    <div
                      key={r.rowKey}
                      data-row={r.rowKey}
                      style={css(
                        `display:flex;height:${r.h}px;border-bottom:1px solid #eeebe6;background:${r.rowBg}`,
                      )}
                    >
                      <div
                        style={css(
                          `box-sizing:border-box;position:sticky;left:0;z-index:2;width:210px;flex:0 0 210px;border-right:1px solid #e6e3dd;background:${r.labelBg};display:flex;align-items:center;gap:8px;padding:0 12px;overflow:hidden`,
                        )}
                      >
                        <div
                          style={css(
                            `width:8px;height:8px;flex:0 0 auto;border-radius:${r.dotRadius};background:${r.dot}`,
                          )}
                        />
                        <div style={css('min-width:0')}>
                          <div
                            style={css(
                              `font-size:12.5px;font-weight:${r.weight};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${r.fg}`,
                            )}
                          >
                            {r.label}
                          </div>
                          <div
                            style={css(
                              'font-size:10px;color:#a8a49c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis',
                            )}
                          >
                            {r.sub}
                          </div>
                        </div>
                      </div>
                      <div
                        style={css(
                          `position:relative;flex:0 0 auto;width:${v.gridW}px`,
                        )}
                      >
                        {r.bars.map((b) => (
                          <div
                            key={b.id}
                            onPointerDown={b.onDown}
                            onClick={b.onClick}
                            onContextMenu={b.onMenu}
                            title={b.title}
                            style={css(
                              `box-sizing:border-box;position:absolute;top:${b.top}px;left:${b.left}px;width:${b.width}px;height:${b.height}px;background:${b.bg};border:1px solid ${b.border};border-radius:${b.radius}px;box-shadow:${b.shadow};display:flex;align-items:center;gap:6px;padding:0 8px;cursor:${b.cursor};overflow:hidden;user-select:none;touch-action:none;opacity:${b.dim ? 0.25 : 1};transition:opacity 0.15s`,
                            )}
                          >
                            {b.isBug && (
                              <div
                                style={css(
                                  'flex:0 0 auto;width:6px;height:6px;border-radius:50%;background:oklch(0.55 0.20 25)',
                                )}
                              />
                            )}
                            <div
                              style={css(
                                `font-family:ui-monospace,Menlo,monospace;font-size:9.5px;letter-spacing:0.03em;color:${b.keyFg};white-space:nowrap`,
                              )}
                            >
                              {b.key}
                            </div>
                            <div
                              style={css(
                                `font-size:11.5px;color:${b.fg};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:${b.weight}`,
                              )}
                            >
                              {b.title}
                            </div>
                            {b.isTask && (
                              <>
                                <div
                                  onPointerDown={b.onLink}
                                  title="Collega: deve iniziare dopo"
                                  style={css(
                                    `margin-left:auto;flex:0 0 auto;font-size:11px;line-height:1;color:${b.linkFg};background:${b.linkBg};border-radius:4px;padding:3px 4px;cursor:crosshair`,
                                  )}
                                >
                                  ⇢
                                </div>
                                <div
                                  onPointerDown={b.onResizeL}
                                  style={css(
                                    'position:absolute;left:0;top:0;bottom:0;width:6px;cursor:ew-resize',
                                  )}
                                />
                                <div
                                  onPointerDown={b.onResizeR}
                                  style={css(
                                    'position:absolute;right:0;top:0;bottom:0;width:6px;cursor:ew-resize',
                                  )}
                                />
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <svg
                  width={v.gridW}
                  height={v.bodyH}
                  style={css(
                    'position:absolute;top:0;left:210px;z-index:3;pointer-events:none;overflow:visible',
                  )}
                >
                  {v.arrows.map((a, i) => (
                    <path
                      key={'p' + i}
                      d={a.d}
                      fill="none"
                      stroke="#b6803f"
                      strokeWidth={1.5}
                      opacity={a.dim ? 0.2 : 1}
                    />
                  ))}
                  {v.arrows.map((a, i) => (
                    <polygon
                      key={'h' + i}
                      points={a.head}
                      fill="#b6803f"
                      opacity={a.dim ? 0.2 : 1}
                    />
                  ))}
                </svg>

                <div
                  style={css(
                    `position:absolute;top:0;height:${v.bodyH}px;left:${v.nowLeft}px;width:2px;background:#d93a3a;z-index:4;pointer-events:none`,
                  )}
                />
                <div
                  style={css(
                    `position:absolute;top:0;left:${v.nowLabelLeft}px;z-index:4;pointer-events:none;background:#d93a3a;color:#fff;font-size:9px;font-weight:700;letter-spacing:0.08em;padding:2px 5px;border-radius:0 0 4px 4px`,
                  )}
                >
                  NOW
                </div>
              </div>
            </div>
          </div>

          {/* right detail panel */}
          {v.hasSelection && (
            <div
              style={css(
                'width:300px;flex:0 0 300px;border-left:1px solid #e6e3dd;background:#fff;overflow-y:auto;padding:16px',
              )}
            >
              <div
                style={css(
                  'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px',
                )}
              >
                <div
                  style={css(
                    'font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#8a8781',
                  )}
                >
                  Attività
                </div>
                <button
                  onClick={v.clearSelection}
                  style={css(
                    'border:none;background:transparent;color:#b3afa7;cursor:pointer;font-size:15px;line-height:1',
                  )}
                >
                  ×
                </button>
              </div>
              <div style={css('display:flex;flex-direction:column;gap:12px')}>
                <label style={css('display:flex;flex-direction:column;gap:4px')}>
                  <span style={css('font-size:11px;color:#8a8781')}>Key</span>
                  <input
                    value={v.sel.key}
                    onChange={v.setKey}
                    style={css(
                      'border:1px solid #e6e3dd;border-radius:6px;padding:7px 8px;font-family:ui-monospace,Menlo,monospace;font-size:12px',
                    )}
                  />
                </label>
                <label style={css('display:flex;flex-direction:column;gap:4px')}>
                  <span style={css('font-size:11px;color:#8a8781')}>Titolo</span>
                  <input
                    value={v.sel.title}
                    onChange={v.setTitle}
                    style={css(
                      'border:1px solid #e6e3dd;border-radius:6px;padding:7px 8px;font-size:13px',
                    )}
                  />
                </label>
                <label style={css('display:flex;flex-direction:column;gap:4px')}>
                  <span style={css('font-size:11px;color:#8a8781')}>Tipo</span>
                  <select
                    value={v.sel.type}
                    onChange={v.setType}
                    style={css(
                      'border:1px solid #e6e3dd;border-radius:6px;padding:7px 8px;font-size:13px;background:#fff',
                    )}
                  >
                    <option value="task">Task</option>
                    <option value="bug">Bug</option>
                  </select>
                </label>
                <label style={css('display:flex;flex-direction:column;gap:4px')}>
                  <span style={css('font-size:11px;color:#8a8781')}>Epica</span>
                  <select
                    value={v.sel.epicId}
                    onChange={v.setEpic}
                    style={css(
                      'border:1px solid #e6e3dd;border-radius:6px;padding:7px 8px;font-size:13px;background:#fff',
                    )}
                  >
                    {v.epicOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={css('display:flex;flex-direction:column;gap:4px')}>
                  <span style={css('font-size:11px;color:#8a8781')}>
                    Assegnatario
                  </span>
                  <select
                    value={v.sel.assignee}
                    onChange={v.setAssignee}
                    style={css(
                      'border:1px solid #e6e3dd;border-radius:6px;padding:7px 8px;font-size:13px;background:#fff',
                    )}
                  >
                    {v.assigneeOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={css('display:flex;gap:10px')}>
                  <label
                    style={css(
                      'flex:1;display:flex;flex-direction:column;gap:4px',
                    )}
                  >
                    <span style={css('font-size:11px;color:#8a8781')}>
                      Inizio
                    </span>
                    <input
                      type="date"
                      value={v.sel.start}
                      onChange={v.setStart}
                      style={css(
                        'border:1px solid #e6e3dd;border-radius:6px;padding:6px 8px;font-size:12px',
                      )}
                    />
                  </label>
                  <label
                    style={css(
                      'width:86px;display:flex;flex-direction:column;gap:4px',
                    )}
                  >
                    <span style={css('font-size:11px;color:#8a8781')}>
                      Giorni
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={v.sel.days}
                      onChange={v.setDays}
                      style={css(
                        'border:1px solid #e6e3dd;border-radius:6px;padding:6px 8px;font-size:12px',
                      )}
                    />
                  </label>
                </div>
                <div>
                  <div
                    style={css('font-size:11px;color:#8a8781;margin-bottom:6px')}
                  >
                    Deve iniziare dopo
                  </div>
                  <div
                    style={css('display:flex;flex-direction:column;gap:5px')}
                  >
                    {v.selDeps.map((d) => (
                      <div
                        key={d.id}
                        style={css(
                          'display:flex;align-items:center;gap:6px;border:1px solid #eeebe6;border-radius:6px;padding:5px 8px;background:#fdfdfc',
                        )}
                      >
                        <div
                          style={css(
                            'flex:1;min-width:0;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis',
                          )}
                        >
                          {d.name}
                        </div>
                        <button
                          onClick={d.onRemove}
                          style={css(
                            'border:none;background:transparent;color:#b3afa7;cursor:pointer',
                          )}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <div
                    style={css('font-size:11px;color:#a8a49c;margin-top:6px')}
                  >
                    {v.depHint}
                  </div>
                </div>
                <div style={css('display:flex;gap:8px;margin-top:2px')}>
                  <button
                    onClick={v.onSave}
                    style={css(
                      `flex:1;padding:9px;border:1px solid ${v.saveBd};background:${v.saveBg};color:${v.saveFg};border-radius:6px;cursor:${v.saveCursor};font-weight:600`,
                    )}
                  >
                    {v.saveLabel}
                  </button>
                  <button
                    onClick={v.onRevert}
                    style={css(
                      'padding:9px 12px;border:1px solid #ddd9d2;background:#fff;color:#54524d;border-radius:6px;cursor:pointer',
                    )}
                  >
                    Annulla
                  </button>
                </div>
                <button
                  onClick={v.deleteTask}
                  style={css(
                    'padding:8px;border:1px solid #f0dcdc;background:#fdf6f6;color:#b23b3b;border-radius:6px;cursor:pointer',
                  )}
                >
                  Elimina attività
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ---- epic edit modal ---- */}
        {v.epicEditOpen && (
          <div
            style={css(
              'position:fixed;inset:0;background:rgba(28,27,25,0.4);z-index:60;display:flex;align-items:center;justify-content:center;padding:40px',
            )}
          >
            <div
              style={css(
                'width:680px;max-width:100%;background:#fff;border-radius:12px;padding:20px;box-shadow:0 24px 60px rgba(0,0,0,0.22)',
              )}
            >
              <div style={css('font-size:14px;font-weight:600;margin-bottom:4px')}>
                Modifica epica · {v.epicEditKey}
              </div>
              <div
                style={css(
                  'font-size:11.5px;color:#8a8781;line-height:1.5;margin-bottom:12px;text-wrap:pretty',
                )}
              >
                Stessa codifica di «incolla epica». Aggiungi o togli righe per
                creare/eliminare attività, cambia{' '}
                <span style={mono}>@assegnatario</span>, la durata{' '}
                <span style={mono}>5d</span> e la data d&apos;inizio{' '}
                <span style={mono}>&gt;2026-09-07</span> (se la ometti,
                l&apos;attività segue la precedente). Le attività riconosciute
                dalla stessa key conservano id e dipendenze.
              </div>
              <textarea
                value={v.epicEditText}
                onChange={v.setEpicEditText}
                spellCheck={false}
                style={css(
                  'width:100%;height:280px;box-sizing:border-box;border:1px solid #e6e3dd;border-radius:8px;padding:10px;font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.6;resize:vertical',
                )}
              />
              <div
                style={css(
                  'display:flex;align-items:center;gap:8px;margin-top:12px',
                )}
              >
                <div style={css('font-size:11px;color:#a8a49c')}>
                  {v.epicEditHint}
                </div>
                <button
                  onClick={v.closeEpicEdit}
                  style={css(
                    'margin-left:auto;padding:8px 14px;border:1px solid #ddd9d2;background:#fff;border-radius:6px;cursor:pointer',
                  )}
                >
                  Annulla
                </button>
                <button
                  onClick={v.saveEpicEdit}
                  style={css(
                    'padding:8px 16px;border:1px solid #1c1b19;background:#1c1b19;color:#fff;border-radius:6px;cursor:pointer;font-weight:500',
                  )}
                >
                  Applica
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---- import modal ---- */}
        {v.importOpen && (
          <div
            style={css(
              'position:fixed;inset:0;background:rgba(28,27,25,0.4);z-index:50;display:flex;align-items:center;justify-content:center;padding:40px',
            )}
          >
            <div
              style={css(
                'width:620px;max-width:100%;background:#fff;border-radius:12px;padding:20px;box-shadow:0 24px 60px rgba(0,0,0,0.22)',
              )}
            >
              <div style={css('font-size:14px;font-weight:600;margin-bottom:4px')}>
                Incolla epiche e attività
              </div>
              <div
                style={css(
                  'font-size:11.5px;color:#8a8781;line-height:1.5;margin-bottom:12px;text-wrap:pretty',
                )}
              >
                Formato: <span style={mono}>epic: KEY titolo</span> · righe{' '}
                <span style={mono}>- task: KEY titolo</span> (opzionali{' '}
                <span style={mono}>@nome</span> e <span style={mono}>5d</span>) ·{' '}
                <span style={mono}>start: 2026-09-07</span> ·{' '}
                <span style={mono}>due date: 2026-10-30</span>. Va bene anche
                l&apos;export Jira: ogni riga che inizia con{' '}
                <span style={mono}>-</span> o con una key{' '}
                <span style={mono}>SSP-123</span> diventa un task (il tipo finale
                «Task/Bug» viene ignorato). Righe prima di qualsiasi{' '}
                <span style={mono}>epic:</span> → attività standalone.
              </div>
              <textarea
                value={v.importText}
                onChange={v.setImportText}
                spellCheck={false}
                style={css(
                  'width:100%;height:230px;box-sizing:border-box;border:1px solid #e6e3dd;border-radius:8px;padding:10px;font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.6;resize:vertical',
                )}
              />
              <div
                style={css(
                  'display:flex;justify-content:flex-end;gap:8px;margin-top:12px',
                )}
              >
                <button
                  onClick={v.closeImport}
                  style={css(
                    'padding:8px 14px;border:1px solid #ddd9d2;background:#fff;border-radius:6px;cursor:pointer',
                  )}
                >
                  Annulla
                </button>
                <button
                  onClick={v.runImport}
                  style={css(
                    'padding:8px 16px;border:1px solid #1c1b19;background:#1c1b19;color:#fff;border-radius:6px;cursor:pointer;font-weight:500',
                  )}
                >
                  Importa
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---- task right-click menu ---- */}
        {v.menu && (
          <>
            <div
              onPointerDown={v.menu.close}
              onContextMenu={(ev) => {
                ev.preventDefault();
                v.menu!.close();
              }}
              style={css('position:fixed;inset:0;z-index:60')}
            />
            <div
              role="menu"
              onContextMenu={(ev) => ev.preventDefault()}
              style={css(
                `position:fixed;left:${v.menu.left}px;top:${v.menu.top}px;z-index:61;width:220px;box-sizing:border-box;padding:4px;background:#fff;border:1px solid #e6e3dd;border-radius:8px;box-shadow:0 8px 24px rgba(28,27,25,0.14);font-size:12.5px;color:#1c1b19`,
              )}
            >
              <div
                style={css(
                  'padding:6px 8px 4px;font-size:11px;color:#8a8781;white-space:nowrap;overflow:hidden;text-overflow:ellipsis',
                )}
              >
                {v.menu.heading}
              </div>
              <div
                style={css(
                  'padding:6px 8px 2px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#a8a49c',
                )}
              >
                Assegna a
              </div>
              {v.menu.people.map((p) => (
                <button
                  key={p.id || '__none'}
                  role="menuitemradio"
                  aria-checked={p.current}
                  className="tp-menu-item"
                  onClick={p.onPick}
                  style={css(p.current ? 'font-weight:600' : '')}
                >
                  <span
                    style={css(
                      `width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:${p.dot}`,
                    )}
                  />
                  <span style={css('flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis')}>
                    {p.name}
                  </span>
                  {p.current && <span style={css('color:#8a8781')}>✓</span>}
                </button>
              ))}
              <div style={css('height:1px;background:#eeebe6;margin:4px 2px')} />
              {v.menu.epicAction && (
                <button
                  role="menuitem"
                  className="tp-menu-item"
                  onClick={v.menu.epicAction.run}
                >
                  {v.menu.epicAction.label}
                </button>
              )}
              <button
                role="menuitem"
                className="tp-menu-item"
                onClick={v.menu.onOpen}
              >
                Apri dettagli
              </button>
            </div>
          </>
        )}
      </div>
    );
  }
}

// --- persistence status pill ------------------------------------------

const SYNC_LABEL: Record<SyncStatus, [string, string]> = {
  local: ['solo questo browser', '#a8a49c'],
  connecting: ['connessione al db…', '#a8a49c'],
  synced: ['db condiviso · salvato', '#3f8f5a'],
  saving: ['salvataggio…', '#c08a2b'],
  readonly: ['sola lettura', '#8a8781'],
  error: ['errore db', '#c0392b'],
};

function SyncBadge({ status, detail }: { status: SyncStatus; detail: string }) {
  const [label, color] = SYNC_LABEL[status];
  return (
    <div
      title={detail || label}
      style={css(
        "display:flex;align-items:center;gap:6px;font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11px;color:#8a8781",
      )}
    >
      <span
        style={css(
          `width:7px;height:7px;border-radius:50%;background:${color};display:inline-block`,
        )}
      />
      {label}
    </div>
  );
}
