import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { Language, StoryRecord } from '../types';

const DB_NAME = 'radio_nocturne';
const DB_VERSION = 2;
const TABLE_NAME = 'stories';
const WEB_KEY = 'radio_nocturne_stories_v1';

let sqlite: SQLiteConnection | null = null;
let db: SQLiteDBConnection | null = null;

const isNative = Capacitor.isNativePlatform();

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `rn_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
};

const mapRow = (row: Record<string, any>): StoryRecord => ({
  id: String(row.id),
  topic: String(row.topic || ''),
  language: row.language as Language,
  text: String(row.text || ''),
  createdAt: String(row.created_at || ''),
  isFavorite: Boolean(row.is_favorite),
  lastOffset: Number(row.last_offset || 0),
  lastProgressAt: row.last_progress_at ? String(row.last_progress_at) : undefined,
});

const readWebStories = (): StoryRecord[] => {
  try {
    const raw = localStorage.getItem(WEB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      id: String(item.id || createId()),
      topic: String(item.topic || ''),
      language: item.language as Language,
      text: String(item.text || ''),
      createdAt: String(item.createdAt || ''),
      isFavorite: Boolean(item.isFavorite),
      lastOffset: Number(item.lastOffset || 0),
      lastProgressAt: item.lastProgressAt ? String(item.lastProgressAt) : undefined,
    }));
  } catch {
    return [];
  }
};

const writeWebStories = (stories: StoryRecord[]) => {
  localStorage.setItem(WEB_KEY, JSON.stringify(stories));
};

const ensureDb = async () => {
  if (!isNative) return null;
  if (!sqlite) {
    sqlite = new SQLiteConnection(CapacitorSQLite);
  }
  if (!db) {
    db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false);
    await db.open();
    await db.execute(
      `CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id TEXT PRIMARY KEY NOT NULL,
        topic TEXT NOT NULL,
        language TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        last_offset INTEGER NOT NULL DEFAULT 0,
        last_progress_at TEXT
      );`
    );
    try {
      await db.execute(`ALTER TABLE ${TABLE_NAME} ADD COLUMN last_offset INTEGER NOT NULL DEFAULT 0;`);
    } catch {
      // Column already exists
    }
    try {
      await db.execute(`ALTER TABLE ${TABLE_NAME} ADD COLUMN last_progress_at TEXT;`);
    } catch {
      // Column already exists
    }
  }
  return db;
};

export const initStoryStore = async () => {
  if (!isNative) return;
  await ensureDb();
};

export const listStories = async (): Promise<StoryRecord[]> => {
  if (!isNative) {
    const stories = readWebStories();
    return stories.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }
  const database = await ensureDb();
  if (!database) return [];
  const results = await database.query(
    `SELECT * FROM ${TABLE_NAME} ORDER BY is_favorite DESC, created_at DESC`
  );
  return (results.values || []).map(mapRow);
};

export const saveStory = async (input: {
  topic: string;
  language: Language;
  text: string;
}): Promise<StoryRecord> => {
  const record: StoryRecord = {
    id: createId(),
    topic: input.topic,
    language: input.language,
    text: input.text,
    createdAt: new Date().toISOString(),
    isFavorite: false,
    lastOffset: 0,
    lastProgressAt: undefined,
  };

  if (!isNative) {
    const stories = readWebStories();
    stories.unshift(record);
    writeWebStories(stories);
    return record;
  }

  const database = await ensureDb();
  if (!database) return record;
  await database.run(
    `INSERT INTO ${TABLE_NAME} (id, topic, language, text, created_at, is_favorite, last_offset, last_progress_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.topic,
      record.language,
      record.text,
      record.createdAt,
      record.isFavorite ? 1 : 0,
      record.lastOffset,
      record.lastProgressAt ?? null,
    ]
  );
  return record;
};

export const setStoryFavorite = async (id: string, isFavorite: boolean) => {
  if (!isNative) {
    const stories = readWebStories();
    const next = stories.map((story) =>
      story.id === id ? { ...story, isFavorite } : story
    );
    writeWebStories(next);
    return;
  }
  const database = await ensureDb();
  if (!database) return;
  await database.run(
    `UPDATE ${TABLE_NAME} SET is_favorite = ? WHERE id = ?`,
    [isFavorite ? 1 : 0, id]
  );
};

export const updateStoryProgress = async (id: string, offset: number) => {
  const now = new Date().toISOString();
  if (!isNative) {
    const stories = readWebStories();
    const next = stories.map((story) =>
      story.id === id ? { ...story, lastOffset: Math.max(0, offset), lastProgressAt: now } : story
    );
    writeWebStories(next);
    return;
  }

  const database = await ensureDb();
  if (!database) return;
  await database.run(
    `UPDATE ${TABLE_NAME} SET last_offset = ?, last_progress_at = ? WHERE id = ?`,
    [Math.max(0, offset), now, id]
  );
};
