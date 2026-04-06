import fs from "fs";

// Types matching the schema
export interface Session {
  id: number;
  personaId: string;
  productId: string;
  repName: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  transcript: string;
  scorecardJson: string | null;
}

export interface Message {
  id: number;
  sessionId: number;
  role: string;
  content: string;
  timestamp: string;
  tone: string | null;
}

export interface InsertSession {
  personaId: string;
  productId: string;
  repName: string;
  status?: string;
  startedAt: string;
  endedAt?: string | null;
  transcript?: string;
  scorecardJson?: string | null;
}

export interface InsertMessage {
  sessionId: number;
  role: string;
  content: string;
  timestamp: string;
  tone?: string | null;
}

interface DBData {
  sessions: Session[];
  messages: Message[];
  nextSessionId: number;
  nextMessageId: number;
}

const DB_FILE = "simulator.json";

function loadDb(): DBData {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    }
  } catch {}
  return { sessions: [], messages: [], nextSessionId: 1, nextMessageId: 1 };
}

function saveDb(data: DBData) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

let db = loadDb();

export class Storage {
  createSession(data: InsertSession): Session {
    const session: Session = {
      id: db.nextSessionId++,
      personaId: data.personaId,
      productId: data.productId,
      repName: data.repName,
      status: data.status ?? "active",
      startedAt: data.startedAt,
      endedAt: data.endedAt ?? null,
      transcript: data.transcript ?? "[]",
      scorecardJson: data.scorecardJson ?? null,
    };
    db.sessions.push(session);
    saveDb(db);
    return session;
  }

  getSession(id: number): Session | undefined {
    return db.sessions.find((s) => s.id === id);
  }

  getAllSessions(): Session[] {
    return db.sessions;
  }

  updateSession(id: number, data: Partial<Session>): Session | undefined {
    const idx = db.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return undefined;
    db.sessions[idx] = { ...db.sessions[idx], ...data };
    saveDb(db);
    return db.sessions[idx];
  }

  addMessage(data: InsertMessage): Message {
    const message: Message = {
      id: db.nextMessageId++,
      sessionId: data.sessionId,
      role: data.role,
      content: data.content,
      timestamp: data.timestamp,
      tone: data.tone ?? null,
    };
    db.messages.push(message);
    saveDb(db);
    return message;
  }

  getMessages(sessionId: number): Message[] {
    return db.messages.filter((m) => m.sessionId === sessionId);
  }
}

export const storage = new Storage();
