// Persistence backends for the planner.
//
// - Local (npm run dev, a saved file): the whole PlannerData in localStorage.
// - Shared DB (published as a claude.ai Artifact with the `db` capability):
//   one document per member / epic / task, live-synced across viewers.
//
// The component stays the single source of truth: it hands every new state
// to `DbSync.push()`, which diffs it against what the store last confirmed
// and writes only the changed documents, debounced so a drag or a burst of
// keystrokes becomes one write per document.

import type { Epic, Member, PlannerData, Task } from './types';

// --- minimal typings for the claude.ai runtime (contract 0.2.x) ----------

interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface QuerySnap {
  docs: DocSnap[];
}
interface DbError {
  code: string;
  message: string;
}
interface DocRef {
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
interface CollRef {
  doc(id: string): DocRef;
  onSnapshot(
    next: (s: QuerySnap) => void,
    error?: (e: DbError) => void,
  ): () => void;
}
interface DB {
  collection(path: string): CollRef;
}

declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
  }
}

// --- local storage ------------------------------------------------------

const STORAGE_KEY = 'team-planner-v1';
const DAYW_KEY = 'team-planner-dayW';

export function loadLocal(): Partial<PlannerData> | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveLocal(d: PlannerData) {
  try {
    const { dayW, members, epics, tasks } = d;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ dayW, members, epics, tasks }),
    );
  } catch {
    /* storage may be unavailable */
  }
}

/** Zoom is a per-viewer preference, never shared through the DB. */
export function loadDayW(): number | null {
  try {
    const n = Number(localStorage.getItem(DAYW_KEY));
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function saveDayW(n: number) {
  try {
    localStorage.setItem(DAYW_KEY, String(n));
  } catch {
    /* ignore */
  }
}

const HIGHLIGHT_KEY = 'team-planner-highlight';

/** Highlighted epics are a per-viewer view setting, like zoom. */
export function loadHighlight(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HIGHLIGHT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveHighlight(ids: string[]) {
  try {
    localStorage.setItem(HIGHLIGHT_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

// --- shared DB ----------------------------------------------------------

/** True when running inside the claude.ai viewer (published Artifact). */
export const hostedOnClaude = (): boolean =>
  typeof window !== 'undefined' && typeof window.claude?.use === 'function';

export type SyncStatus =
  | 'local' // localStorage only
  | 'connecting'
  | 'synced'
  | 'saving'
  | 'readonly' // viewer may read but not write
  | 'error';

type Coll = 'members' | 'epics' | 'tasks';
const COLLS: Coll[] = ['members', 'epics', 'tasks'];
type Item = Member | Epic | Task;
type Remote = Pick<PlannerData, Coll>;

const DEBOUNCE_MS = 500;

/** Members and epics keep their on-screen order through a `pos` field. */
const ordered = (c: Coll) => c !== 'tasks';

/** JSON with sorted keys, so store and local bodies compare equal. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
      : x,
  );
}

function serialize(c: Coll, items: Item[]): Map<string, string> {
  const m = new Map<string, string>();
  items.forEach((it, i) => {
    const body: Record<string, unknown> = { ...it };
    delete body.id;
    if (ordered(c)) body.pos = i;
    m.set(it.id, canon(body));
  });
  return m;
}

export class DbSync {
  private db: DB;
  /** Last body (JSON) the store confirmed, per collection and id. */
  private mirror: Record<Coll, Map<string, string>> = {
    members: new Map(),
    epics: new Map(),
    tasks: new Map(),
  };
  /** Local changes not yet written: JSON body, or null for a delete. */
  private pending: Record<Coll, Map<string, string | null>> = {
    members: new Map(),
    epics: new Map(),
    tasks: new Map(),
  };
  private ready = new Set<Coll>();
  private unsubs: (() => void)[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private readonly = false;

  constructor(
    db: DB,
    private onRemote: (data: Remote) => void,
    private onStatus: (s: SyncStatus, detail?: string) => void,
  ) {
    this.db = db;
  }

  /** Resolve the db capability; null when this view cannot use it. */
  static async connect(
    onRemote: (data: Remote) => void,
    onStatus: (s: SyncStatus, detail?: string) => void,
  ): Promise<DbSync | null> {
    const db = (await window.claude!.use('db')) as DB | null;
    if (!db) return null;
    const sync = new DbSync(db, onRemote, onStatus);
    sync.subscribe();
    return sync;
  }

  private subscribe() {
    this.onStatus('connecting');
    COLLS.forEach((c) => {
      const unsub = this.db.collection(c).onSnapshot(
        (snap) => {
          const m = new Map<string, string>();
          snap.docs.forEach((d) => {
            if (d.exists) m.set(d.id, canon(d.data()));
          });
          this.mirror[c] = m;
          this.ready.add(c);
          if (this.ready.size === COLLS.length) this.emit();
        },
        (e) => this.onStatus('error', e.message),
      );
      this.unsubs.push(unsub);
    });
  }

  /** Remote state with not-yet-written local changes laid on top. */
  private emit() {
    const out = {} as Remote;
    COLLS.forEach((c) => {
      const merged = new Map(this.mirror[c]);
      this.pending[c].forEach((body, id) =>
        body === null ? merged.delete(id) : merged.set(id, body),
      );
      const items = [...merged].map(([id, body]) => ({
        ...JSON.parse(body),
        id,
      }));
      if (ordered(c))
        items.sort((a, b) => (a.pos ?? 1e9) - (b.pos ?? 1e9));
      items.forEach((it) => delete it.pos);
      (out as Record<Coll, unknown[]>)[c] = items;
    });
    this.onRemote(out);
    if (!this.hasPending() && !this.readonly) this.onStatus('synced');
  }

  get isReady() {
    return this.ready.size === COLLS.length;
  }

  private hasPending() {
    return COLLS.some((c) => this.pending[c].size > 0);
  }

  /** Queue whatever differs between `data` and the store. */
  push(data: PlannerData) {
    if (!this.isReady || this.readonly) return;
    let changed = false;
    COLLS.forEach((c) => {
      const next = serialize(c, data[c] as Item[]);
      const remote = this.mirror[c];
      const pend = this.pending[c];
      next.forEach((body, id) => {
        const want = remote.get(id) === body ? undefined : body;
        if (want === undefined) {
          if (pend.has(id)) {
            pend.delete(id);
            changed = true;
          }
        } else if (pend.get(id) !== want) {
          pend.set(id, want);
          changed = true;
        }
      });
      remote.forEach((_, id) => {
        if (!next.has(id) && pend.get(id) !== null) {
          pend.set(id, null);
          changed = true;
        }
      });
    });
    if (!changed) return;
    this.onStatus('saving');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), DEBOUNCE_MS);
  }

  private async flush() {
    this.timer = null;
    if (this.flushing) return;
    this.flushing = true;
    try {
      for (const c of COLLS) {
        for (const [id, body] of [...this.pending[c]]) {
          const ref = this.db.collection(c).doc(id);
          if (body === null) await ref.delete();
          else await ref.set(JSON.parse(body));
          // Only clear it if nothing newer was queued while writing.
          if (this.pending[c].get(id) === body) {
            this.pending[c].delete(id);
            if (body === null) this.mirror[c].delete(id);
            else this.mirror[c].set(id, body);
          }
        }
      }
    } catch (e) {
      const code = (e as DbError)?.code;
      if (code === 'invalid_argument') {
        // A well-formed write refused: this viewer cannot write here.
        this.readonly = true;
        COLLS.forEach((c) => this.pending[c].clear());
        this.onStatus('readonly');
        this.emit();
      } else {
        this.onStatus('error', (e as DbError)?.message || String(e));
        if (code === 'unavailable' && !this.timer)
          this.timer = setTimeout(() => this.flush(), 2000 + Math.random() * 2000);
      }
      return;
    } finally {
      this.flushing = false;
    }
    if (this.hasPending()) this.flush();
    else this.onStatus('synced');
  }

  close() {
    this.unsubs.forEach((u) => u());
    if (this.timer) clearTimeout(this.timer);
  }
}
