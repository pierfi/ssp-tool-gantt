// Domain model for the Team Planner. Mirrors the shapes used by the
// original "Team Planner.dc.html" Claude Design component.

export interface Member {
  id: string;
  name: string;
  hue: number;
}

export interface Epic {
  id: string;
  key: string;
  title: string;
  hue: number;
  /** ISO yyyy-mm-dd, optional */
  due?: string;
  /** ISO yyyy-mm-dd, optional preferred start */
  start?: string;
}

export type TaskType = 'task' | 'bug';

export interface Task {
  id: string;
  epicId: string | null;
  key: string;
  title: string;
  assignee: string | null;
  /** ISO yyyy-mm-dd */
  start: string;
  days: number;
  /** ids of tasks this one must start after */
  deps: string[];
  type: TaskType;
  /** true once the type was set explicitly by the user (stops bug/keyword inference) */
  typeSet?: boolean;
}

/** The slice of state that is persisted to localStorage. */
export interface PlannerData {
  dayW: number;
  members: Member[];
  epics: Epic[];
  tasks: Task[];
}

/** Transient edit buffer for the selected task's detail panel. */
export interface Draft {
  id: string;
  key: string;
  title: string;
  epicId: string;
  assignee: string;
  start: string;
  days: number | string;
  type: string;
}

// --- parser output -------------------------------------------------------

export interface ParsedEpic {
  id: string;
  key: string;
  title: string;
  hue: number;
  due: string;
  start: string;
}

export interface ParsedTask {
  id: string;
  /** id of the ParsedEpic this belongs to, or null for standalone */
  epicKey: string | null;
  key: string;
  title: string;
  assigneeName: string | null;
  days: number;
  start: string | null;
  deps: string[];
  type: TaskType;
}
