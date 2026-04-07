// Client-side session storage using localStorage

import type { CallConfig } from "./jobs";

export interface StoredScript {
  fileName: string;
  mimeType: string;
  text: string;
  html: string;
  dataUrl: string;
}

export interface Session {
  id: number;
  personaId: string;        // Legacy field — kept for backward compatibility
  productId: string;
  repName: string;          // Legacy field — defaulted to "Sales Rep"
  runId?: string;           // Groups all stacked calls from one launch
  callConfig?: CallConfig;
  script?: StoredScript;
  status: "active" | "completed";
  startedAt: string;
  endedAt: string | null;
  transcript: Array<{ role: string; content: string }>;
  scorecardJson: any | null;
}

const STORAGE_KEY = "cold_call_sessions";

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSessions(sessions: Session[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

let nextId = (() => {
  const sessions = loadSessions();
  return sessions.length > 0 ? Math.max(...sessions.map(s => s.id)) + 1 : 1;
})();

export function createSession(opts: {
  productId: string;
  callConfig: CallConfig;
  script?: StoredScript;
  runId?: string;
}): Session {
  const session: Session = {
    id: nextId++,
    personaId: opts.callConfig.jobTitleId,
    productId: opts.productId,
    repName: "Sales Rep",
    runId: opts.runId,
    callConfig: opts.callConfig,
    script: opts.script,
    status: "active",
    startedAt: new Date().toISOString(),
    endedAt: null,
    transcript: [],
    scorecardJson: null,
  };
  const sessions = loadSessions();
  sessions.push(session);
  saveSessions(sessions);
  return session;
}

export function getSession(id: number): Session | undefined {
  return loadSessions().find(s => s.id === id);
}

export function getAllSessions(): Session[] {
  return loadSessions();
}

export function updateSession(id: number, data: Partial<Session>): Session | undefined {
  const sessions = loadSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx === -1) return undefined;
  sessions[idx] = { ...sessions[idx], ...data };
  saveSessions(sessions);
  return sessions[idx];
}

export function addMessageToSession(id: number, role: string, content: string): Session | undefined {
  const sessions = loadSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx === -1) return undefined;
  sessions[idx].transcript.push({ role, content });
  saveSessions(sessions);
  return sessions[idx];
}
