import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const defaultDataDir = join(__dirname, 'data')
const databaseUrl = process.env.DATABASE_URL?.trim() || ''
const usePostgres = Boolean(databaseUrl)
const dbFile = resolve(process.env.DB_PATH?.trim() || join(defaultDataDir, 'app.sqlite'))
const dataDir = dirname(dbFile)
const legacyUsersFile = join(dataDir, 'users.json')
const legacyPartiesFile = join(dataDir, 'parties.json')
const legacySessionsFile = join(dataDir, 'sessions.json')
const legacyMatchResultsFile = join(dataDir, 'match-results.json')
const postgresSslMode = process.env.PGSSLMODE?.trim()?.toLowerCase() || ''
const usePostgresSsl =
  usePostgres &&
  postgresSslMode !== 'disable' &&
  (process.env.NODE_ENV === 'production' || postgresSslMode === 'require')

if (!usePostgres && !existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true })
}

const db = usePostgres ? null : new DatabaseSync(dbFile)
const pool = usePostgres
  ? new Pool({
      connectionString: databaseUrl,
      ssl: usePostgresSsl ? { rejectUnauthorized: false } : false,
    })
  : null

const state = {
  users: [],
  sessions: [],
  parties: [],
  matchResults: [],
}

let initialized = false
let initError = null
let lastPersistError = null
let lastPersistedAt = null
let persistQueue = Promise.resolve()

function cloneValue(value) {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value))
}

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

function ensureInitialized() {
  if (!initialized) {
    throw new Error('Database has not been initialized yet.')
  }
}

function runSqliteTransaction(callback) {
  db.exec('BEGIN')
  try {
    const result = callback()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {}
    throw error
  }
}

async function withPostgresTransaction(callback) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {}
    throw error
  } finally {
    client.release()
  }
}

function enqueuePersist(task) {
  persistQueue = persistQueue
    .then(async () => {
      await task()
      lastPersistError = null
      lastPersistedAt = new Date().toISOString()
    })
    .catch((error) => {
      lastPersistError = error instanceof Error ? error.message : 'Unknown persistence error'
      console.error('Persistent storage write failed:', error)
    })

  return persistQueue
}

function createSqliteSchema() {
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
}

async function createPostgresSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_json JSONB NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS parties (
      code TEXT PRIMARY KEY,
      leader_id TEXT NOT NULL,
      party_json JSONB NOT NULL,
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
}

function loadUsersFromSqlite() {
  const rows = db.prepare(`
    SELECT id, email, password_hash AS passwordHash, display_name AS displayName, created_at AS createdAt
    FROM users
    ORDER BY created_at ASC
  `).all()

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    createdAt: row.createdAt,
  }))
}

function loadSessionsFromSqlite() {
  const rows = db.prepare(`
    SELECT id, user_json AS userJson, created_at AS createdAt, updated_at AS updatedAt
    FROM sessions
  `).all()

  return rows.map((row) => ({
    id: row.id,
    user: JSON.parse(row.userJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

function loadPartiesFromSqlite() {
  const rows = db.prepare(`
    SELECT party_json AS partyJson
    FROM parties
    ORDER BY created_at ASC
  `).all()

  return rows.map((row) => JSON.parse(row.partyJson))
}

function loadMatchResultsFromSqlite() {
  const rows = db.prepare(`
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
  `).all()

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

async function loadUsersFromPostgres() {
  const { rows } = await pool.query(`
    SELECT id, email, password_hash AS "passwordHash", display_name AS "displayName", created_at AS "createdAt"
    FROM users
    ORDER BY created_at ASC
  `)

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    createdAt: row.createdAt,
  }))
}

async function loadSessionsFromPostgres() {
  const { rows } = await pool.query(`
    SELECT id, user_json AS "userJson", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM sessions
  `)

  return rows.map((row) => ({
    id: row.id,
    user: row.userJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

async function loadPartiesFromPostgres() {
  const { rows } = await pool.query(`
    SELECT party_json AS "partyJson"
    FROM parties
    ORDER BY created_at ASC
  `)

  return rows.map((row) => row.partyJson)
}

async function loadMatchResultsFromPostgres() {
  const { rows } = await pool.query(`
    SELECT
      id,
      user_id AS "userId",
      total_score AS "totalScore",
      round_count AS "roundCount",
      round_time AS "roundTime",
      mode,
      match_type AS "matchType",
      played_at AS "playedAt"
    FROM match_results
    ORDER BY played_at DESC
  `)

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

function persistUsersToSqlite(users) {
  const clear = db.prepare('DELETE FROM users')
  const insert = db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)

  runSqliteTransaction(() => {
    clear.run()
    for (const user of users) {
      insert.run(user.id, user.email, user.passwordHash, user.displayName, user.createdAt)
    }
  })
}

function persistSessionsToSqlite(sessions) {
  const clear = db.prepare('DELETE FROM sessions')
  const insert = db.prepare(`
    INSERT INTO sessions (id, user_json, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `)

  runSqliteTransaction(() => {
    clear.run()
    for (const session of sessions) {
      insert.run(session.id, JSON.stringify(session.user), session.createdAt, session.updatedAt)
    }
  })
}

function persistPartiesToSqlite(parties) {
  const clear = db.prepare('DELETE FROM parties')
  const insert = db.prepare(`
    INSERT INTO parties (code, leader_id, party_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `)

  runSqliteTransaction(() => {
    clear.run()
    for (const party of parties) {
      insert.run(party.code, party.leaderId, JSON.stringify(party), party.createdAt, party.updatedAt)
    }
  })
}

function persistMatchResultsToSqlite(results) {
  const clear = db.prepare('DELETE FROM match_results')
  const insert = db.prepare(`
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
  `)

  runSqliteTransaction(() => {
    clear.run()
    for (const result of results) {
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
  })
}

async function persistUsersToPostgres(users) {
  await withPostgresTransaction(async (client) => {
    await client.query('DELETE FROM users')
    for (const user of users) {
      await client.query(
        `
          INSERT INTO users (id, email, password_hash, display_name, created_at)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [user.id, user.email, user.passwordHash, user.displayName, user.createdAt],
      )
    }
  })
}

async function persistSessionsToPostgres(sessions) {
  await withPostgresTransaction(async (client) => {
    await client.query('DELETE FROM sessions')
    for (const session of sessions) {
      await client.query(
        `
          INSERT INTO sessions (id, user_json, created_at, updated_at)
          VALUES ($1, $2::jsonb, $3, $4)
        `,
        [session.id, JSON.stringify(session.user), session.createdAt, session.updatedAt],
      )
    }
  })
}

async function persistPartiesToPostgres(parties) {
  await withPostgresTransaction(async (client) => {
    await client.query('DELETE FROM parties')
    for (const party of parties) {
      await client.query(
        `
          INSERT INTO parties (code, leader_id, party_json, created_at, updated_at)
          VALUES ($1, $2, $3::jsonb, $4, $5)
        `,
        [party.code, party.leaderId, JSON.stringify(party), party.createdAt, party.updatedAt],
      )
    }
  })
}

async function persistMatchResultsToPostgres(results) {
  await withPostgresTransaction(async (client) => {
    await client.query('DELETE FROM match_results')
    for (const result of results) {
      await client.query(
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
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          result.id,
          result.userId,
          Number(result.totalScore),
          Number(result.roundCount),
          Number(result.roundTime),
          result.mode,
          result.matchType ?? 'regular',
          result.playedAt,
        ],
      )
    }
  })
}

async function migrateLegacyDataIfNeededForPostgres() {
  const userCount = Number((await pool.query('SELECT COUNT(*)::int AS count FROM users')).rows[0]?.count ?? 0)
  if (userCount === 0) {
    await persistUsersToPostgres(safeReadJson(legacyUsersFile, []))
  }

  const sessionCount = Number((await pool.query('SELECT COUNT(*)::int AS count FROM sessions')).rows[0]?.count ?? 0)
  if (sessionCount === 0) {
    await persistSessionsToPostgres(safeReadJson(legacySessionsFile, []))
  }

  const partyCount = Number((await pool.query('SELECT COUNT(*)::int AS count FROM parties')).rows[0]?.count ?? 0)
  if (partyCount === 0) {
    await persistPartiesToPostgres(safeReadJson(legacyPartiesFile, []))
  }

  const matchCount = Number((await pool.query('SELECT COUNT(*)::int AS count FROM match_results')).rows[0]?.count ?? 0)
  if (matchCount === 0) {
    await persistMatchResultsToPostgres(safeReadJson(legacyMatchResultsFile, []))
  }
}

function migrateLegacyDataIfNeededForSqlite() {
  const userCount = Number(db.prepare('SELECT COUNT(*) AS count FROM users').get().count ?? 0)
  if (userCount === 0) {
    persistUsersToSqlite(safeReadJson(legacyUsersFile, []))
  }

  const sessionCount = Number(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count ?? 0)
  if (sessionCount === 0) {
    persistSessionsToSqlite(safeReadJson(legacySessionsFile, []))
  }

  const partyCount = Number(db.prepare('SELECT COUNT(*) AS count FROM parties').get().count ?? 0)
  if (partyCount === 0) {
    persistPartiesToSqlite(safeReadJson(legacyPartiesFile, []))
  }

  const matchCount = Number(db.prepare('SELECT COUNT(*) AS count FROM match_results').get().count ?? 0)
  if (matchCount === 0) {
    persistMatchResultsToSqlite(safeReadJson(legacyMatchResultsFile, []))
  }
}

export async function initializeDatabase() {
  if (initialized) {
    return
  }

  try {
    if (usePostgres) {
      await createPostgresSchema()
      await migrateLegacyDataIfNeededForPostgres()
      state.users = await loadUsersFromPostgres()
      state.sessions = await loadSessionsFromPostgres()
      state.parties = await loadPartiesFromPostgres()
      state.matchResults = await loadMatchResultsFromPostgres()
    } else {
      createSqliteSchema()
      migrateLegacyDataIfNeededForSqlite()
      state.users = loadUsersFromSqlite()
      state.sessions = loadSessionsFromSqlite()
      state.parties = loadPartiesFromSqlite()
      state.matchResults = loadMatchResultsFromSqlite()
    }

    initialized = true
    initError = null
  } catch (error) {
    initError = error instanceof Error ? error.message : 'Unknown database initialization error'
    throw error
  }
}

export function loadUsers() {
  ensureInitialized()
  return cloneValue(state.users)
}

export function saveUsers(users) {
  ensureInitialized()
  const nextUsers = cloneValue(users)
  state.users = nextUsers

  if (usePostgres) {
    void enqueuePersist(() => persistUsersToPostgres(nextUsers))
    return
  }

  persistUsersToSqlite(nextUsers)
}

export function loadSessions() {
  ensureInitialized()
  return cloneValue(state.sessions)
}

export function saveSessions(sessions) {
  ensureInitialized()
  const nextSessions = cloneValue(sessions)
  state.sessions = nextSessions

  if (usePostgres) {
    void enqueuePersist(() => persistSessionsToPostgres(nextSessions))
    return
  }

  persistSessionsToSqlite(nextSessions)
}

export function loadParties() {
  ensureInitialized()
  return cloneValue(state.parties)
}

export function saveParties(parties) {
  ensureInitialized()
  const nextParties = cloneValue(parties)
  state.parties = nextParties

  if (usePostgres) {
    void enqueuePersist(() => persistPartiesToPostgres(nextParties))
    return
  }

  persistPartiesToSqlite(nextParties)
}

export function loadMatchResults() {
  ensureInitialized()
  return cloneValue(state.matchResults)
}

export function saveMatchResults(results) {
  ensureInitialized()
  const nextResults = cloneValue(results)
  state.matchResults = nextResults

  if (usePostgres) {
    void enqueuePersist(() => persistMatchResultsToPostgres(nextResults))
    return
  }

  persistMatchResultsToSqlite(nextResults)
}

export function getDatabaseHealth() {
  if (usePostgres) {
    return {
      ok: initialized && !initError && !lastPersistError,
      mode: 'postgres',
      file: null,
      quickCheck: initialized ? 'connected' : 'not-initialized',
      error: initError ?? lastPersistError ?? null,
      lastPersistedAt,
    }
  }

  try {
    const pragma = db.prepare('PRAGMA quick_check').get()
    const writable = db.prepare('PRAGMA journal_mode').get()

    return {
      ok: true,
      mode: 'sqlite',
      file: dbFile,
      quickCheck: pragma?.quick_check ?? 'ok',
      journalMode: writable?.journal_mode ?? null,
      lastPersistedAt,
      error: initError ?? lastPersistError ?? null,
    }
  } catch (error) {
    return {
      ok: false,
      mode: 'sqlite',
      file: dbFile,
      error: error instanceof Error ? error.message : 'Unknown database error',
      lastPersistedAt,
    }
  }
}
