/**
 * Marketing · Creative Brief Workspace (module-local).
 *
 * The DAL `CreativeBrief` intentionally stays minimal (id / kind / title /
 * brief / status / createdAt). The creative-agent tabs (Content Agent,
 * Design Agent, Video Studio) need richer, kind-specific planning data —
 * hook variations, a full script, caption + hashtags, a production checklist,
 * format / platform / target-date — that mirrors the Manus creative tools.
 *
 * Rather than fake AI generation or touch the shared DAL (owned by another
 * builder), we persist that depth in a small localStorage store keyed by the
 * real brief id. When the AI connector phase lands it can hydrate these same
 * fields. Everything here is real, editable, user-authored demo state.
 */

export interface ChecklistItem { id: string; text: string; done: boolean; }

export interface BriefWorkspace {
  briefId: string;
  format: string;          // reel / carousel / story / one-pager / mini-doc …
  platform: string;        // instagram / tiktok / facebook / print …
  targetDate: string;      // yyyy-mm-dd, "" when unscheduled
  owner: string;           // who's carrying it
  hooks: string[];         // scroll-stop hook variations
  scriptHook: string;      // 0–3s opener
  scriptBody: string;      // main beats
  scriptCta: string;       // closing call to action
  onScreenText: string[];  // captions burned onto the video/graphic
  caption: string;         // post caption
  hashtags: string;        // hashtag block
  notes: string;           // free notes / art direction
  checklist: ChecklistItem[];
  updatedAt: string;
}

const KEY = "shbbq.mk.briefWorkspace.v1";

function readAll(): Record<string, BriefWorkspace> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, BriefWorkspace>) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, BriefWorkspace>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage full / unavailable — non-fatal for demo */
  }
}

function blank(briefId: string): BriefWorkspace {
  return {
    briefId,
    format: "",
    platform: "",
    targetDate: "",
    owner: "",
    hooks: [],
    scriptHook: "",
    scriptBody: "",
    scriptCta: "",
    onScreenText: [],
    caption: "",
    hashtags: "",
    notes: "",
    checklist: [],
    updatedAt: "",
  };
}

/** Read one workspace, always returning a hydrated object (never null). */
export function getWorkspace(briefId: string): BriefWorkspace {
  return readAll()[briefId] ?? blank(briefId);
}

/** Persist a workspace and stamp updatedAt. Returns the stored value. */
export function saveWorkspace(ws: BriefWorkspace, now: string): BriefWorkspace {
  const map = readAll();
  const next: BriefWorkspace = { ...ws, updatedAt: now };
  map[ws.briefId] = next;
  writeAll(map);
  return next;
}

/** True when a brief has any creative work captured beyond the DAL fields. */
export function hasWork(ws: BriefWorkspace): boolean {
  return Boolean(
    ws.format || ws.platform || ws.targetDate || ws.owner ||
    ws.hooks.length || ws.scriptHook || ws.scriptBody || ws.scriptCta ||
    ws.onScreenText.length || ws.caption || ws.hashtags || ws.notes ||
    ws.checklist.length,
  );
}

/** Completed / total checklist counts for a quick progress read. */
export function checklistProgress(ws: BriefWorkspace): { done: number; total: number } {
  return { done: ws.checklist.filter(c => c.done).length, total: ws.checklist.length };
}

export type BriefKindKey = "content" | "design" | "video" | "ads";

/** Per-kind format options and quick-start production checklists. */
export const KIND_CONFIG: Record<BriefKindKey, {
  formats: string[];
  platforms: string[];
  checklistTemplate: string[];
  showScript: boolean;
  showCaption: boolean;
  showHooks: boolean;
}> = {
  content: {
    formats: ["Caption series", "Carousel", "Single post", "Story set", "Thread"],
    platforms: ["Instagram", "Facebook", "TikTok", "Email"],
    checklistTemplate: ["Draft copy", "Peer review", "Add to calendar", "Schedule post"],
    showScript: false,
    showCaption: true,
    showHooks: true,
  },
  design: {
    formats: ["Story template", "One-pager PDF", "Menu graphic", "Ad creative", "Signage"],
    platforms: ["Instagram", "Facebook", "Print", "In-store"],
    checklistTemplate: ["Gather brand assets", "First draft", "Review round", "Export final files"],
    showScript: false,
    showCaption: false,
    showHooks: false,
  },
  video: {
    formats: ["Reel", "Mini-doc", "Hype loop", "TikTok", "YouTube Short"],
    platforms: ["Instagram Reels", "TikTok", "YouTube Shorts", "Facebook"],
    checklistTemplate: ["Lock script", "Shot list", "Film", "Edit", "Add captions", "Schedule"],
    showScript: true,
    showCaption: true,
    showHooks: true,
  },
  ads: {
    formats: ["Lead form", "Responsive search", "Carousel ad", "Video ad"],
    platforms: ["Meta", "Google", "TikTok"],
    checklistTemplate: ["Write copy", "Build creative", "Set audience", "QA & launch"],
    showScript: false,
    showCaption: true,
    showHooks: true,
  },
};
