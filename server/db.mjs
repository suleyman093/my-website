import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const defaultDataDir = join(__dirname, 'data')
const dbFile = resolve(process.env.DB_PATH?.trim() || join(defaultDataDir, 'app.sqlite'))
const dataDir = dirname(dbFile)
const legacyUsersFile = join(dataDir, 'users.json')
const legacyPartiesFile = join(dataDir, 'parties.json')
const legacySessionsFile = join(dataDir, 'sessions.json')
const legacyMatchResultsFile = join(dataDir, 'match-results.json')

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true })
}

const db = new DatabaseSync(dbFile)

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS parties (
    code TEXT PRIMARY KEY,
    leader_id TEXT NOT NULL,
    party_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS match_results (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    total_score INTEGER NOT NULL,
    round_count INTEGER NOT NULL,
    round_time INTEGER NOT NULL,
    mode TEXT NOT NULL,
    match_type TEXT NOT NULL,
    played_at TEXT NOT NULL,
    PRIMARY KEY (id, user_id)
  );
`)

function safeReadJson(path, fallback) {
  if (!existsSync(path)) {
    return fallback
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

function migrateLegacyDataIfNeeded() {
  const userCount = Number(db.prepare('SELECT COUNT(*) AS count FROM users').get().count ?? 0)
  if (userCount === 0) {
    saveUsers(safeReadJson(legacyUsersFile, []))
  }

  const sessionCount = Number(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count ?? 0)
  if (sessionCount === 0) {
    saveSessions(safeReadJson(legacySessionsFile, []))
  }

  const partyCount = Number(db.prepare('SELECT COUNT(*) AS count FROM parties').get().count ?? 0)
  if (partyCount === 0) {
    saveParties(safeReadJson(legacyPartiesFile, []))
  }

  const matchCount = Number(
    db.prepare('SELECT COUNT(*) AS count FROM match_results').get().count ?? 0,
  )
  if (matchCount === 0) {
    saveMatchResults(safeReadJson(legacyMatchResultsFile, []))
  }
}

export function loadUsers() {
  const rows = db
    .prepare(
      `
        SELECT id, email, password_hash AS passwordHash, display_name AS displayName, created_at AS createdAt
        FROM users
        ORDER BY created_at ASC
      `,
    )
    .all()

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    createdAt: row.createdAt,
  }))
}

export function saveUsers(users) {
  const clear = db.prepare('DELETE FROM users')
  const insert = db.prepare(
    `
      INSERT INTO users (id, email, password_hash, display_name, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
  )

  db.transaction((nextUsers) => {
    clear.run()
    for (const user of nextUsers) {
      insert.run(
        user.id,
        user.email,
        user.passwordHash,
        user.displayName,
        user.createdAt,
      )
    }
  })(users)
}

export function loadSessions() {
  const rows = db
    .prepare(
      `
        SELECT id, user_json AS userJson, created_at AS createdAt, updated_at AS updatedAt
        FROM sessions
      `,
    )
    .all()

  return rows.map((row) => ({
    id: row.id,
    user: JSON.parse(row.userJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

export function saveSessions(sessions) {
  const clear = db.prepare('DELETE FROM sessions')
  const insert = db.prepare(
    `
      INSERT INTO sessions (id, user_json, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `,
  )

  db.transaction((nextSessions) => {
    clear.run()
    for (const session of nextSessions) {
      insert.run(
        session.id,
        JSON.stringify(session.user),
        session.createdAt,
        session.updatedAt,
      )
    }
  })(sessions)
}

export function loadParties() {
  const rows = db
    .prepare(
      `
        SELECT party_json AS partyJson
        FROM parties
        ORDER BY created_at ASC
      `,
    )
    .all()

  return rows.map((row) => JSON.parse(row.partyJson))
}

export function saveParties(parties) {
  const clear = db.prepare('DELETE FROM parties')
  const insert = db.prepare(
    `
      INSERT INTO parties (code, leader_id, party_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `,
  )

  db.transaction((nextParties) => {
    clear.run()
    for (const party of nextParties) {
      insert.run(
        party.code,
        party.leaderId,
        JSON.stringify(party),
        party.createdAt,
        party.updatedAt,
      )
    }
  })(parties)
}

export function loadMatchResults() {
  const rows = db
    .prepare(
      `
        SELECT
          id,
          user_id AS userId,
          total_score AS totalScore,
          round_count AS roundCount,
          round_time AS roundTime,
          mode,
          match_type AS matchType,
          played_at AS playedAt
        FROM match_results
        ORDER BY played_at DESC
      `,
    )
    .all()

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    totalScore: Number(row.totalScore),
    roundCount: Number(row.roundCount),
    roundTime: Number(row.roundTime),
    mode: row.mode,
    matchType: row.matchType,
    playedAt: row.playedAt,
  }))
}

export function saveMatchResults(results) {
  const clear = db.prepare('DELETE FROM match_results')
  const insert = db.prepare(
    `
      INSERT INTO match_results (
        id,
        user_id,
        total_score,
        round_count,
        round_time,
        mode,
        match_type,
        played_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )

  db.transaction((nextResults) => {
    clear.run()
    for (const result of nextResults) {
      insert.run(
        result.id,
        result.userId,
        Number(result.totalScore),
        Number(result.roundCount),
        Number(result.roundTime),
        result.mode,
        result.matchType ?? 'regular',
        result.playedAt,
      )
    }
  })(results)
}

migrateLegacyDataIfNeeded()

export function getDatabaseHealth() {
  try {
    const pragma = db.prepare('PRAGMA quick_check').get()
    const writable = db.prepare('PRAGMA journal_mode').get()

    return {
      ok: true,
      file: dbFile,
      quickCheck: pragma?.quick_check ?? 'ok',
      journalMode: writable?.journal_mode ?? null,
    }
  } catch (error) {
    return {
      ok: false,
      file: dbFile,
      error: error instanceof Error ? error.message : 'Unknown database error',
    }
  }
}
