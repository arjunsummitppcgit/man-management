// ─── Assistant shared types ──────────────────────────────────────────────────
// The result envelope every assistant tool returns. The model receives a
// compact JSON of this (to reference numbers + write a summary); the UI
// receives the full envelope and renders it on the results canvas.

export type ResultKind = 'kpi' | 'table' | 'card' | 'chart';

/**
 * Meaning-based colour. The same metric carries the same colour everywhere in
 * the assistant — company labour is always teal, outside labour always amber —
 * so a number's colour tells you WHAT it is, not how big it is.
 */
export type ColumnTone =
  | 'company'
  | 'outside'
  | 'kgBasic'
  | 'dailyWage'
  | 'total'
  | 'hon'
  | 'hl'
  | 'va'
  | 'wip'
  | 'present'
  | 'absent'
  | 'neutral';

export interface ResultColumn {
  key: string;
  label: string;
  format?: 'number' | 'kg' | 'currency' | 'date' | 'text' | 'percent';
  /** Colour tied to the metric's meaning; omit for plain text columns. */
  tone?: ColumnTone;
  /**
   * Footer maths for this column. Numeric columns default to 'sum'; use 'avg'
   * for rates and 'none' where a total would be meaningless (grades, ₹ rates).
   */
  total?: 'sum' | 'avg' | 'none';
  /** Show each cell's share of the column total beneath the value. */
  share?: boolean;
}

export interface KpiTile {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'default' | 'success' | 'danger' | 'accent';
}

export interface ToolResult {
  kind: ResultKind;
  /** Specific heading naming the metric and its scope, not a generic label. */
  title: string;
  /** One line under the title saying what the table actually contains. */
  subtitle?: string;
  /** KPI tiles shown above the table (optional for any kind) */
  kpis?: KpiTile[];
  columns?: ResultColumn[];
  rows?: Record<string, string | number | null>[];
  /** card kind: label/value pairs */
  fields?: { label: string; value: string }[];
  chart?: {
    type: 'bar' | 'line';
    xKey: string;
    series: { key: string; label: string }[];
  };
  meta: {
    /** ISO yyyy-MM-dd (or "from → to"). Rendered as dd-mm-yy by the UI. */
    date_resolved?: string;
    /** Pre-formatted dd-mm-yy period for the pill and export headers. */
    period_label?: string;
    person_resolved?: string;
    source_tables: string[];
    row_count: number;
    no_data?: boolean;
    unit?: string;
  };
}

// ─── Chat wire types ─────────────────────────────────────────────────────────

export interface AssistantApiRequest {
  question: string;
  /** Prior turns, oldest first, for follow-up context ("his salary") */
  history: { role: 'user' | 'assistant'; content: string }[];
}

export interface AssistantApiResponse {
  summary: string;
  results: ToolResult[];
  /** e.g. "Arjun Varma · 19 Jul 2026" — shown as the resolved-context pill */
  resolved?: string;
  model: string;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  resolved?: string;
  /** indices into the results canvas produced by this turn */
  resultIds?: string[];
  error?: boolean;
}

export interface CanvasResult extends ToolResult {
  id: string;
  askedAt: string;
  question: string;
}
