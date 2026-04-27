import { createServer } from 'node:http'
import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getDatabaseHealth,
  initializeDatabase,
  loadMatchResults,
  loadParties,
  loadSessions,
  loadUsers,
  saveMatchResults,
  saveParties,
  saveSessions,
  saveUsers,
} from './db.mjs'
import { buildServerRoundPlan } from './randomRoundGenerator.mjs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const appRoot = resolve(__dirname, '..')
const distDir = join(appRoot, 'dist')
const port = Number(process.env.PORT || 8787)
const partyStreams = new Map()
const sessionCookieName = 'mueyyensayt.sid'
const requestBuckets = new Map()
const sessionLifetimeMs = 1000 * 60 * 60 * 24 * 30
const finishedPartyRetentionMs = 1000 * 60 * 60 * 12
const idlePartyRetentionMs = 1000 * 60 * 60 * 24 * 7
const revealAutoAdvanceMs = 1000 * 60 * 2
const bucketWindowMs = 1000 * 15
const bucketMaxRequests = 240
const maxJsonBodyBytes = 64 * 1024
const maxPartyMembers = 20
const maxChatMessageLength = 280
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const partyCodePattern = /^[A-Z0-9]{6}$/
const isProduction = process.env.NODE_ENV === 'production'
const cookieSameSite = process.env.COOKIE_SAME_SITE?.trim() || 'Lax'
const cookieSecureOverride = process.env.COOKIE_SECURE?.trim()
const configuredAppOrigins = String(process.env.APP_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const allowedOrigins = new Set(
  configuredAppOrigins.length > 0
    ? configuredAppOrigins
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
)
const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim() || `http://localhost:${port}`
const cookieSecureEnabled = cookieSecureOverride
  ? cookieSecureOverride.toLowerCase() === 'true'
  : isProduction
const mapsApiKey =
  process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || ''

const guestAdjectives = [
  'Swift',
  'Quiet',
  'Wandering',
  'Sharp',
  'Curious',
  'Golden',
  'North',
  'Bright',
  'Hidden',
  'Lucky',
]

const guestNouns = [
  'Compass',
  'Atlas',
  'Marker',
  'Voyager',
  'Scout',
  'Nomad',
  'Trail',
  'Pathfinder',
  'Globe',
  'Beacon',
]

const seededLeaderboardData = {
  daily: [
    { name: 'Selin', country: 'TR', score: 24280, winRate: 81, roundsPlayed: 26, streak: 6 },
    { name: 'Noah', country: 'BE', score: 23810, winRate: 79, roundsPlayed: 24, streak: 5 },
    { name: 'Mira', country: 'JO', score: 23140, winRate: 76, roundsPlayed: 23, streak: 4 },
    { name: 'Emir', country: 'DE', score: 22710, winRate: 74, roundsPlayed: 22, streak: 4 },
    { name: 'Lina', country: 'SE', score: 22440, winRate: 72, roundsPlayed: 21, streak: 3 },
    { name: 'Kai', country: 'JP', score: 21980, winRate: 68, roundsPlayed: 20, streak: 2 },
    { name: 'Nora', country: 'FR', score: 21760, winRate: 67, roundsPlayed: 19, streak: 2 },
    { name: 'Yusuf', country: 'NL', score: 21490, winRate: 65, roundsPlayed: 18, streak: 2 },
  ],
  monthly: [
    { name: 'Mira', country: 'JO', score: 106420, winRate: 78, roundsPlayed: 114, streak: 12 },
    { name: 'Selin', country: 'TR', score: 104980, winRate: 77, roundsPlayed: 112, streak: 11 },
    { name: 'Noah', country: 'BE', score: 101730, winRate: 75, roundsPlayed: 109, streak: 9 },
    { name: 'Talia', country: 'US', score: 99880, winRate: 73, roundsPlayed: 108, streak: 8 },
    { name: 'Lina', country: 'SE', score: 97240, winRate: 71, roundsPlayed: 103, streak: 7 },
    { name: 'Emir', country: 'DE', score: 95820, winRate: 69, roundsPlayed: 101, streak: 7 },
    { name: 'Rami', country: 'AE', score: 93450, winRate: 68, roundsPlayed: 97, streak: 5 },
    { name: 'Nora', country: 'FR', score: 91890, winRate: 66, roundsPlayed: 95, streak: 4 },
  ],
  'all-time': [
    { name: 'Noah', country: 'BE', score: 524110, winRate: 74, roundsPlayed: 522, streak: 19 },
    { name: 'Mira', country: 'JO', score: 517980, winRate: 73, roundsPlayed: 516, streak: 16 },
    { name: 'Selin', country: 'TR', score: 506430, winRate: 72, roundsPlayed: 509, streak: 15 },
    { name: 'Lina', country: 'SE', score: 492660, winRate: 69, roundsPlayed: 494, streak: 14 },
    { name: 'Emir', country: 'DE', score: 488320, winRate: 69, roundsPlayed: 489, streak: 12 },
    { name: 'Talia', country: 'US', score: 471240, winRate: 67, roundsPlayed: 478, streak: 11 },
    { name: 'Kai', country: 'JP', score: 463180, winRate: 66, roundsPlayed: 470, streak: 10 },
    { name: 'Rami', country: 'AE', score: 452900, winRate: 64, roundsPlayed: 461, streak: 9 },
  ],
}

function buildRuntimeChecks() {
  const errors = []
  const warnings = []
  const normalizedSameSite = cookieSameSite.toLowerCase()
  const validSameSiteValues = new Set(['lax', 'strict', 'none'])
  const dbHealth = getDatabaseHealth()
  const distAvailable = existsSync(distDir)

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    errors.push('PORT must be a valid TCP port between 1 and 65535.')
  }

  if (!validSameSiteValues.has(normalizedSameSite)) {
    errors.push('COOKIE_SAME_SITE must be one of Lax, Strict, or None.')
  }

  if (normalizedSameSite === 'none' && !cookieSecureEnabled) {
    errors.push('COOKIE_SAME_SITE=None requires COOKIE_SECURE=true.')
  }

  if (isProduction && !cookieSecureEnabled) {
    errors.push('Production requires secure cookies. Set COOKIE_SECURE=true.')
  }

  if (isProduction && configuredAppOrigins.length === 0) {
    errors.push('APP_ORIGIN must be set explicitly in production.')
  }

  if (isProduction && !publicBaseUrl.startsWith('https://')) {
    warnings.push('PUBLIC_BASE_URL should use https:// in production.')
  }

  if (isProduction && [...allowedOrigins].some((origin) => origin.startsWith('http://'))) {
    warnings.push('APP_ORIGIN contains a non-HTTPS origin in production.')
  }

  if (isProduction && !distAvailable) {
    errors.push('dist/ is missing. Run the frontend build before serving production traffic.')
  }

  if (!mapsApiKey) {
    warnings.push(
      'GOOGLE_MAPS_API_KEY is not configured. Random Street View generation will fall back to the curated pool.',
    )
  }

  if (!dbHealth.ok || dbHealth.quickCheck !== 'ok') {
    errors.push(`Database health check failed${dbHealth.error ? `: ${dbHealth.error}` : '.'}`)
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    dbHealth,
    distAvailable,
  }
}

function logRuntimeChecks() {
  const checks = buildRuntimeChecks()
  const prefix = '[startup]'

  if (checks.ok) {
    console.log(`${prefix} Runtime checks passed.`)
  }

  for (const warning of checks.warnings) {
    console.warn(`${prefix} Warning: ${warning}`)
  }

  for (const error of checks.errors) {
    console.error(`${prefix} Error: ${error}`)
  }
}

function registerPartyStream(code, res) {
  const normalizedCode = normalizeCode(code)
  const streams = partyStreams.get(normalizedCode) ?? new Set()
  streams.add(res)
  partyStreams.set(normalizedCode, streams)

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n')
    } catch {}
  }, 15000)

  res.on('close', () => {
    clearInterval(heartbeat)
    const currentStreams = partyStreams.get(normalizedCode)
    if (!currentStreams) {
      return
    }

    currentStreams.delete(res)
    if (currentStreams.size === 0) {
      partyStreams.delete(normalizedCode)
    }
  })
}

function broadcastPartySnapshot(code, payload) {
  const streams = partyStreams.get(normalizeCode(code))
  if (!streams || streams.size === 0) {
    return
  }

  const eventPayload = `event: party\ndata: ${JSON.stringify(payload)}\n\n`

  for (const stream of streams) {
    try {
      stream.write(eventPayload)
    } catch {}
  }
}

function persistParties(parties, options = {}) {
  saveParties(parties)

  if (options.deletedCode) {
    broadcastPartySnapshot(options.deletedCode, {
      code: normalizeCode(options.deletedCode),
      deleted: true,
      party: null,
    })
    return
  }

  if (options.party) {
    broadcastPartySnapshot(options.party.code, {
      code: normalizeCode(options.party.code),
      deleted: false,
      party: sanitizePartyForClient(options.party),
    })
  }
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
  })
  res.end(JSON.stringify(payload))
}

function setCorsHeaders(req, res) {
  const origin = String(req.headers.origin ?? '')

  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Vary', 'Origin')
  }

  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
}

function sendNoContent(req, res, statusCode = 204) {
  setCorsHeaders(req, res)
  res.writeHead(statusCode)
  res.end()
}

function assertTrustedOrigin(req, res) {
  const origin = String(req.headers.origin ?? '').trim()
  if (!origin) {
    return true
  }

  if (allowedOrigins.has(origin)) {
    return true
  }

  json(res, 403, { error: 'This request origin is not allowed.' })
  return false
}

function getClientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
  return forwarded || req.socket.remoteAddress || 'unknown'
}

function applyRateLimit(req, res) {
  const now = Date.now()
  if (requestBuckets.size > 2000) {
    for (const [bucketKey, bucket] of requestBuckets.entries()) {
      if (now - bucket.startedAt >= bucketWindowMs) {
        requestBuckets.delete(bucketKey)
      }
    }
  }

  const key = `${getClientKey(req)}:${req.method}:${new URL(req.url ?? '/', `http://localhost:${port}`).pathname}`
  const bucket = requestBuckets.get(key)

  if (!bucket || now - bucket.startedAt >= bucketWindowMs) {
    requestBuckets.set(key, { count: 1, startedAt: now })
    return false
  }

  if (bucket.count >= bucketMaxRequests) {
    json(res, 429, { error: 'Too many requests. Please slow down for a moment.' })
    return true
  }

  bucket.count += 1
  return false
}

function cleanupStaleState() {
  const now = Date.now()

  const sessions = loadSessions().filter((session) => {
    const updatedAt = new Date(session.updatedAt ?? session.createdAt).getTime()
    return Number.isFinite(updatedAt) && now - updatedAt < sessionLifetimeMs
  })
  saveSessions(sessions)

  const activeSessionUserIds = new Set(sessions.map((session) => session.user.id))
  const deletedCodes = []
  const changedPartyCodes = new Set()
  const parties = loadParties()
    .map((party) => {
      let changed = false

      if (
        party.members.length > 0 &&
        (!party.members.some((member) => member.userId === party.leaderId) ||
          !activeSessionUserIds.has(party.leaderId))
      ) {
        const nextLeader =
          party.members.find((member) => activeSessionUserIds.has(member.userId)) ?? party.members[0]
        if (nextLeader && nextLeader.userId !== party.leaderId) {
          party.leaderId = nextLeader.userId
          party.updatedAt = nowIso()
          changed = true
        }
      }

      if (party.activeMatch?.status === 'playing') {
        const startedAt = new Date(party.activeMatch.roundStartedAt).getTime()
        const roundDurationMs = Number(party.activeMatch.roundTime) * 1000
        if (Number.isFinite(startedAt) && now - startedAt >= roundDurationMs) {
          const submittedUserIds = new Set(
            party.activeMatch.submissions.map((submission) => submission.userId),
          )

          for (const member of party.members) {
            if (submittedUserIds.has(member.userId)) {
              continue
            }

            upsertSubmission(party.activeMatch.submissions, {
              userId: member.userId,
              guess: null,
              timedOut: true,
              submittedAt: nowIso(),
            })
          }

          finalizeRevealRound(party)
          changed = true
        }
      }

      if (party.activeMatch?.status === 'reveal') {
        const revealUpdatedAt = new Date(
          party.activeMatch.updatedAt ?? party.updatedAt ?? party.createdAt,
        ).getTime()

        if (
          Number.isFinite(revealUpdatedAt) &&
          now - revealUpdatedAt >= revealAutoAdvanceMs &&
          party.members.length > 0
        ) {
          const totalRounds = Number(party.activeMatch.roundCount)
          const shouldFinish =
            party.activeMatch.currentRound >= totalRounds ||
            (party.activeMatch.matchType === 'team-duel' && party.activeMatch.winnerTeam)

          if (shouldFinish) {
            party.activeMatch.status = 'finished'
            party.activeMatch.updatedAt = nowIso()
            party.updatedAt = party.activeMatch.updatedAt
            persistCompletedPartyMatchResults(party)
            changed = true
          } else {
            const nextTarget =
              party.activeMatch.roundPlanTargets?.[party.activeMatch.currentRound] ?? null

            if (nextTarget) {
              party.activeMatch.status = 'playing'
              party.activeMatch.currentRound += 1
              party.activeMatch.targetId = nextTarget.id
              party.activeMatch.targetName = nextTarget.name
              party.activeMatch.targetView = createTargetView(nextTarget)
              party.activeMatch.usedTargetIds = [
                ...party.activeMatch.usedTargetIds,
                nextTarget.id,
              ]
              party.activeMatch.roundStartedAt = nowIso()
              party.activeMatch.submissions = []
              party.activeMatch.updatedAt = party.activeMatch.roundStartedAt
              party.updatedAt = party.activeMatch.updatedAt
              changed = true
            }
          }
        }
      }

      if (changed) {
        changedPartyCodes.add(party.code)
      }

      return party
    })
    .filter((party) => {
    const updatedAt = new Date(party.updatedAt ?? party.createdAt).getTime()
    if (!Number.isFinite(updatedAt)) {
      deletedCodes.push(party.code)
      return false
    }

    if (!party.activeMatch) {
      const keep = now - updatedAt < idlePartyRetentionMs
      if (!keep) {
        deletedCodes.push(party.code)
      }
      return keep
    }

    if (party.activeMatch.status === 'finished') {
      const keep = now - updatedAt < finishedPartyRetentionMs
      if (!keep) {
        deletedCodes.push(party.code)
      }
      return keep
    }

    return true
  })
  saveParties(parties)

  for (const code of deletedCodes) {
    broadcastPartySnapshot(code, {
      code: normalizeCode(code),
      deleted: true,
      party: null,
    })
  }

  for (const party of parties) {
    if (!changedPartyCodes.has(party.code)) {
      continue
    }

    broadcastPartySnapshot(party.code, {
      code: normalizeCode(party.code),
      deleted: false,
      party: sanitizePartyForClient(party),
    })
  }
}

function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${value}`]
  parts.push(`Path=${options.path ?? '/'}`)
  if (typeof options.maxAge === 'number') {
    parts.push(`Max-Age=${options.maxAge}`)
  }
  if (options.httpOnly !== false) {
    parts.push('HttpOnly')
  }
  parts.push(`SameSite=${options.sameSite ?? cookieSameSite}`)
  if (options.secure ?? cookieSecureEnabled) {
    parts.push('Secure')
  }
  res.setHeader('Set-Cookie', parts.join('; '))
}

function clearCookie(res, name) {
  setCookie(res, name, '', { maxAge: 0 })
}

function parseCookies(req) {
  const header = req.headers.cookie ?? ''
  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=')
      if (separatorIndex === -1) {
        return cookies
      }

      const key = part.slice(0, separatorIndex)
      const value = decodeURIComponent(part.slice(separatorIndex + 1))
      cookies[key] = value
      return cookies
    }, {})
}

function createSession(user) {
  const sessions = loadSessions()
  const session = {
    id: randomUUID(),
    user,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  sessions.push(session)
  saveSessions(sessions)
  return session
}

function getSession(req) {
  const sessionId = parseCookies(req)[sessionCookieName]
  if (!sessionId) {
    return null
  }

  const sessions = loadSessions()
  const sessionIndex = sessions.findIndex((session) => session.id === sessionId)
  if (sessionIndex === -1) {
    return null
  }

  const session = sessions[sessionIndex]
  session.updatedAt = nowIso()
  sessions[sessionIndex] = session
  saveSessions(sessions)
  return session
}

function deleteSessionById(sessionId) {
  if (!sessionId) {
    return
  }

  const sessions = loadSessions().filter((session) => session.id !== sessionId)
  saveSessions(sessions)
}

function getCurrentUser(req) {
  return getSession(req)?.user ?? null
}

function requireCurrentUser(req, res) {
  const currentUser = getCurrentUser(req)
  if (!currentUser) {
    json(res, 401, { error: 'You need to be signed in to do that.' })
    return null
  }

  return currentUser
}

function generateUserId() {
  return `MYN-${randomUUID().slice(0, 8).toUpperCase()}`
}

function generatePartyCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const parties = loadParties()
  let code = ''

  do {
    code = Array.from({ length: 6 }, () => {
      const index = Math.floor(Math.random() * alphabet.length)
      return alphabet[index]
    }).join('')
  } while (parties.some((party) => party.code === code))

  return code
}

function generateGuestName() {
  const adjective = guestAdjectives[Math.floor(Math.random() * guestAdjectives.length)]
  const noun = guestNouns[Math.floor(Math.random() * guestNouns.length)]
  const suffix = Math.floor(100 + Math.random() * 900)
  return `${adjective}${noun}${suffix}`
}

function isValidPartyCode(code) {
  return partyCodePattern.test(normalizeCode(code))
}

function normalizeDisplayName(value) {
  return String(value ?? '').trim().slice(0, 32)
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase().slice(0, 160)
}

function normalizePassword(value) {
  return String(value ?? '').slice(0, 256)
}

function parseGuess(value) {
  if (!value) {
    return null
  }

  const lat = Number(value.lat)
  const lng = Number(value.lng)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null
  }

  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
  }
}

function hashPassword(password) {
  const salt = randomUUID()
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash).split(':')
  if (!salt || !hash) {
    return false
  }

  const nextHash = scryptSync(password, salt, 64)
  const currentHash = Buffer.from(hash, 'hex')

  if (nextHash.length !== currentHash.length) {
    return false
  }

  return timingSafeEqual(nextHash, currentHash)
}

function toAuthUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isGuest: false,
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    let tooLarge = false
    req.on('data', (chunk) => {
      if (tooLarge) {
        return
      }

      body += chunk
      if (Buffer.byteLength(body, 'utf8') > maxJsonBodyBytes) {
        tooLarge = true
        reject(new Error('Request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (tooLarge) {
        return
      }

      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function toRadians(value) {
  return (value * Math.PI) / 180
}

function calculateDistanceKm(fromLat, fromLng, toLat, toLng) {
  const earthRadiusKm = 6371
  const deltaLat = toRadians(toLat - fromLat)
  const deltaLng = toRadians(toLng - fromLng)
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}

function calculateScore(distanceKm) {
  return Math.round(5000 * Math.exp(-distanceKm / 2000))
}

function normalizeCode(code) {
  return String(code ?? '').trim().toUpperCase()
}

function nowIso() {
  return new Date().toISOString()
}

function findPartyIndex(parties, code) {
  return parties.findIndex((party) => party.code === normalizeCode(code))
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function createDefaultTotals(members) {
  return members.reduce((totals, member) => {
    totals[member.userId] = 0
    return totals
  }, {})
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizeHalfStep(value, min, max) {
  return clamp(Math.round(value * 2) / 2, min, max)
}

function sanitizePartySettings(input = {}) {
  return {
    matchType: input.matchType === 'team-duel' ? 'team-duel' : 'regular',
    mode: input.mode === 'non-moving' ? 'non-moving' : 'moving',
    roundTime: String(clamp(Math.round(Number(input.roundTime ?? 60)), 1, 600)),
    roundCount: String(clamp(Math.round(Number(input.roundCount ?? 5)), 1, 50)),
    initialPoints: String(clamp(Math.round(Number(input.initialPoints ?? 6000)), 1000, 20000)),
    damageStartRound: String(clamp(Math.round(Number(input.damageStartRound ?? 4)), 1, 50)),
    damageIncrement: String(normalizeHalfStep(Number(input.damageIncrement ?? 1), 0, 10)),
    teamChoiceLocked: Boolean(input.teamChoiceLocked),
  }
}

function createTargetView(target) {
  return {
    lat: target.lat,
    lng: target.lng,
    heading: Number(target.heading ?? 34),
    pitch: Number(target.pitch ?? 8),
    panoId: target.panoId ?? null,
  }
}

function getDamageMultiplier(currentRound, startRound, increment) {
  if (increment <= 0) {
    return 1
  }

  if (currentRound <= startRound) {
    return 1
  }

  return Number((1 + (currentRound - startRound) * increment).toFixed(1))
}

function getBestTeamStanding(standings, team) {
  const teamStandings = standings
    .filter((standing) => standing.team === team && standing.guessed)
    .sort((left, right) => {
      if (left.distanceKm !== right.distanceKm) {
        return left.distanceKm - right.distanceKm
      }

      return right.score - left.score
    })

  return teamStandings[0] ?? null
}

function getTeamScoreTotal(members, totals, team) {
  return members
    .filter((member) => member.team === team)
    .reduce((sum, member) => sum + (totals[member.userId] ?? 0), 0)
}

function resolveWinningTeam(teamPoints, totalScores, members) {
  if (teamPoints.red !== teamPoints.black) {
    return teamPoints.red > teamPoints.black ? 'red' : 'black'
  }

  const redTotal = getTeamScoreTotal(members, totalScores, 'red')
  const blackTotal = getTeamScoreTotal(members, totalScores, 'black')

  if (redTotal !== blackTotal) {
    return redTotal > blackTotal ? 'red' : 'black'
  }

  return null
}

function upsertSubmission(submissions, nextSubmission) {
  const existingIndex = submissions.findIndex(
    (submission) => submission.userId === nextSubmission.userId,
  )

  if (existingIndex === -1) {
    submissions.push(nextSubmission)
    return
  }

  submissions[existingIndex] = nextSubmission
}

function buildRoundStandings(party, target, submissions) {
  const standings = party.members.map((member) => {
    const submission = submissions.find((entry) => entry.userId === member.userId) ?? null
    const guess = submission?.guess ?? null
    const guessed = Boolean(guess)
    const rawDistance = guessed
      ? calculateDistanceKm(guess.lat, guess.lng, target.lat, target.lng)
      : 0
    const distanceKm = guessed ? Math.round(rawDistance) : 0
    const score = guessed ? calculateScore(rawDistance) : 0

    return {
      userId: member.userId,
      displayName: member.displayName,
      team: member.team,
      guessed,
      distanceKm,
      score,
      placement: 0,
      guessPosition: guess,
    }
  })

  standings.sort((left, right) => {
    if (left.guessed !== right.guessed) {
      return left.guessed ? -1 : 1
    }

    if (!left.guessed && !right.guessed) {
      return left.displayName.localeCompare(right.displayName)
    }

    if (left.distanceKm !== right.distanceKm) {
      return left.distanceKm - right.distanceKm
    }

    return right.score - left.score
  })

  standings.forEach((standing, index) => {
    standing.placement = index + 1
  })

  return standings
}

function finalizeRevealRound(party) {
  const match = party.activeMatch
  if (!match || match.status !== 'playing') {
    return party
  }

  const target = {
    id: match.targetId,
    name: match.targetName ?? 'Reveal target',
    lat: match.targetView.lat,
    lng: match.targetView.lng,
  }
  const standings = buildRoundStandings(party, target, match.submissions)
  const totalScores = { ...match.totalScores }
  let teamSnapshot = null

  if (match.matchType === 'team-duel') {
    const redStanding = getBestTeamStanding(standings, 'red')
    const blackStanding = getBestTeamStanding(standings, 'black')
    const multiplier = getDamageMultiplier(
      match.currentRound,
      match.damageStartRound,
      match.damageIncrement,
    )

    const redRoundScore = redStanding?.score ?? 0
    const blackRoundScore = blackStanding?.score ?? 0
    const roundDamage = Math.round(Math.abs(redRoundScore - blackRoundScore) * multiplier)
    const nextTeamPoints = {
      red: match.teamPoints.red,
      black: match.teamPoints.black,
    }

    let winningTeam = null
    if (redRoundScore > blackRoundScore) {
      nextTeamPoints.black = Math.max(0, nextTeamPoints.black - roundDamage)
      winningTeam = 'red'
    } else if (blackRoundScore > redRoundScore) {
      nextTeamPoints.red = Math.max(0, nextTeamPoints.red - roundDamage)
      winningTeam = 'black'
    }

    match.teamPoints = nextTeamPoints

    if (nextTeamPoints.red === 0 || nextTeamPoints.black === 0) {
      match.winnerTeam = resolveWinningTeam(nextTeamPoints, totalScores, party.members)
    }

    teamSnapshot = {
      redPoints: nextTeamPoints.red,
      blackPoints: nextTeamPoints.black,
      redDistanceKm: redStanding?.distanceKm ?? null,
      blackDistanceKm: blackStanding?.distanceKm ?? null,
      redRoundScore,
      blackRoundScore,
      redChosenUserId: redStanding?.userId ?? null,
      blackChosenUserId: blackStanding?.userId ?? null,
      redChosenDisplayName: redStanding?.displayName ?? null,
      blackChosenDisplayName: blackStanding?.displayName ?? null,
      redGuessPosition: redStanding?.guessPosition ?? null,
      blackGuessPosition: blackStanding?.guessPosition ?? null,
      roundDamage,
      multiplier,
      winningTeam,
    }
  } else {
    standings.forEach((standing) => {
      totalScores[standing.userId] = (totalScores[standing.userId] ?? 0) + standing.score
    })
    match.totalScores = totalScores
  }

  if (match.matchType === 'team-duel') {
    match.totalScores = totalScores
  }

  match.roundResults.push({
    roundNumber: match.currentRound,
    targetId: target.id,
    targetName: target.name,
    targetLat: target.lat,
    targetLng: target.lng,
    standings,
    teamSnapshot,
  })
  match.status = 'reveal'
  match.updatedAt = nowIso()
  party.updatedAt = match.updatedAt
  return party
}

function buildRevealSnapshot(party) {
  const match = party.activeMatch
  const roundResult = match?.roundResults.at(-1) ?? null

  if (!match || !roundResult) {
    return null
  }

  return {
    target: {
      id: roundResult.targetId,
      name: roundResult.targetName,
      lat: roundResult.targetLat,
      lng: roundResult.targetLng,
    },
    standings: roundResult.standings,
    totals: match.totalScores,
    teamPoints: match.teamPoints,
    winnerTeam: match.winnerTeam,
    roundResult,
  }
}

function sanitizePartyForClient(party) {
  if (!party) {
    return null
  }

  if (!party.activeMatch) {
    return party
  }

  const { roundPlanTargets, ...activeMatch } = party.activeMatch
  return {
    ...party,
    activeMatch,
  }
}

function getMimeType(path) {
  switch (extname(path).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.mjs':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.ico':
      return 'image/x-icon'
    default:
      return 'application/octet-stream'
  }
}

function tryServeStatic(req, res, path) {
  if (!isProduction || !existsSync(distDir)) {
    return false
  }

  const normalizedPath = path === '/' ? '/index.html' : path
  const requestedFile = resolve(distDir, `.${normalizedPath}`)

  if (!requestedFile.startsWith(distDir)) {
    json(res, 403, { error: 'Forbidden.' })
    return true
  }

  if (existsSync(requestedFile)) {
    res.writeHead(200, {
      'Content-Type': getMimeType(requestedFile),
      'Cache-Control': requestedFile.endsWith('index.html')
        ? 'no-cache'
        : 'public, max-age=31536000, immutable',
    })
    res.end(readFileSync(requestedFile))
    return true
  }

  const indexPath = join(distDir, 'index.html')
  if (!existsSync(indexPath)) {
    return false
  }

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  })
  res.end(readFileSync(indexPath))
  return true
}

function isMatchInsideWindow(match, windowKey) {
  const playedAt = new Date(match.playedAt)
  const now = new Date()

  if (windowKey === 'all-time') {
    return true
  }

  if (windowKey === 'daily') {
    return playedAt.toDateString() === now.toDateString()
  }

  return (
    playedAt.getFullYear() === now.getFullYear() &&
    playedAt.getMonth() === now.getMonth()
  )
}

function buildUserLeaderboardEntry(user, matches, currentUserId) {
  if (matches.length === 0) {
    return null
  }

  const totalScore = matches.reduce((sum, match) => sum + Number(match.totalScore ?? 0), 0)
  const totalRounds = matches.reduce((sum, match) => sum + Number(match.roundCount ?? 0), 0)
  const highScoreMatches = matches.filter((match) => Number(match.totalScore ?? 0) >= 18000).length

  return {
    name: user.displayName,
    country: user.id === currentUserId ? 'YOU' : 'USR',
    score: totalScore,
    winRate: Math.round((highScoreMatches / matches.length) * 100),
    roundsPlayed: totalRounds,
    streak: matches.length,
    isCurrentUser: user.id === currentUserId,
  }
}

function withRanks(entries) {
  return entries
    .slice()
    .sort((left, right) => right.score - left.score)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }))
}

function buildProfileSummary(user) {
  const matches = loadMatchResults()
    .filter((match) => match.userId === user.id)
    .sort((left, right) => new Date(right.playedAt).getTime() - new Date(left.playedAt).getTime())

  const matchesPlayed = matches.length
  const roundsPlayed = matches.reduce((sum, match) => sum + Number(match.roundCount ?? 0), 0)
  const totalScore = matches.reduce((sum, match) => sum + Number(match.totalScore ?? 0), 0)
  const averageScore = matchesPlayed > 0 ? Math.round(totalScore / matchesPlayed) : 0
  const bestMatch = matches.reduce(
    (best, match) => (best == null || Number(match.totalScore ?? 0) > Number(best.totalScore ?? 0) ? match : best),
    null,
  )
  const regularMatches = matches.filter((match) => match.matchType !== 'team-duel').length
  const teamDuelMatches = matches.filter((match) => match.matchType === 'team-duel').length

  return {
    user,
    summary: {
      matchesPlayed,
      roundsPlayed,
      totalScore,
      averageScore,
      bestScore: Number(bestMatch?.totalScore ?? 0),
      bestMode: bestMatch?.mode ?? null,
      bestMatchType: bestMatch?.matchType ?? null,
      lastPlayedAt: matches[0]?.playedAt ?? null,
      regularMatches,
      teamDuelMatches,
    },
    recentMatches: matches.slice(0, 12),
  }
}

function upsertMatchResultRecord(results, record) {
  const existingIndex = results.findIndex(
    (entry) => entry.id === record.id && entry.userId === record.userId,
  )

  if (existingIndex === -1) {
    results.push(record)
    return
  }

  results[existingIndex] = record
}

function persistCompletedPartyMatchResults(party) {
  const match = party.activeMatch
  if (!match || match.status !== 'finished') {
    return
  }

  const results = loadMatchResults()
  const playedAt = String(match.updatedAt ?? nowIso())
  const roundCount = Number(match.roundCount ?? 0)
  const roundTime = Number(match.roundTime ?? 0)
  const matchType = match.matchType === 'team-duel' ? 'team-duel' : 'regular'
  const mode = match.mode === 'non-moving' ? 'non-moving' : 'moving'

  for (const member of party.members) {
    if (member.isGuest) {
      continue
    }

    upsertMatchResultRecord(results, {
      id: match.matchId,
      userId: member.userId,
      totalScore: Number(match.totalScores?.[member.userId] ?? 0),
      roundCount,
      roundTime,
      mode,
      matchType,
      playedAt,
    })
  }

  saveMatchResults(results)
}

function findCurrentUserParty(userId) {
  if (!userId) {
    return null
  }

  const parties = loadParties()
  return (
    parties
      .filter((party) => party.members.some((member) => member.userId === userId))
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0] ??
    null
  )
}

function deriveResumeRoute(party) {
  if (!party) {
    return null
  }

  if (!party.activeMatch) {
    return 'room'
  }

  if (party.activeMatch.status === 'playing') {
    return 'game'
  }

  if (party.activeMatch.status === 'reveal') {
    return 'result'
  }

  if (party.activeMatch.status === 'finished') {
    return 'final-result'
  }

  return 'room'
}

const server = createServer(async (req, res) => {
  if (!req.url || !req.method) {
    setCorsHeaders(req, res)
    json(res, 400, { error: 'Invalid request.' })
    return
  }

  setCorsHeaders(req, res)

  cleanupStaleState()

  if (applyRateLimit(req, res)) {
    return
  }

  if (req.method === 'OPTIONS') {
    sendNoContent(req, res)
    return
  }

  if (req.method !== 'GET' && !assertTrustedOrigin(req, res)) {
    return
  }

  if (req.method === 'GET' && req.url === '/api/health') {
    const checks = buildRuntimeChecks()
    json(res, 200, {
      ok: true,
      status: 'healthy',
      environment: isProduction ? 'production' : 'development',
      publicBaseUrl,
      warnings: checks.warnings,
      database: checks.dbHealth,
      uptimeSeconds: Math.round(process.uptime()),
      now: nowIso(),
    })
    return
  }

  if (req.method === 'GET' && req.url === '/api/ready') {
    const checks = buildRuntimeChecks()
    json(res, checks.ok ? 200 : 503, {
      ok: checks.ok,
      status: checks.ok ? 'ready' : 'degraded',
      environment: isProduction ? 'production' : 'development',
      distAvailable: checks.distAvailable,
      database: checks.dbHealth,
      errors: checks.errors,
      warnings: checks.warnings,
      now: nowIso(),
    })
    return
  }

  if (req.method === 'GET' && req.url === '/api/auth/session') {
    json(res, 200, { user: getCurrentUser(req) })
    return
  }

  if (req.method === 'GET' && req.url === '/api/me/state') {
    const currentUser = getCurrentUser(req)
    if (!currentUser) {
      json(res, 200, { user: null, party: null, route: null })
      return
    }

    const party = findCurrentUserParty(currentUser.id)
    json(res, 200, {
      user: currentUser,
      party: sanitizePartyForClient(party),
      route: deriveResumeRoute(party),
    })
    return
  }

  if (req.method === 'POST' && req.url === '/api/auth/guest') {
    const guestUser = {
      id: generateUserId(),
      email: null,
      displayName: generateGuestName(),
      isGuest: true,
    }
    const session = createSession(guestUser)
    setCookie(res, sessionCookieName, session.id, { maxAge: 60 * 60 * 24 * 30 })
    json(res, 200, {
      user: guestUser,
    })
    return
  }

  if (req.method === 'POST' && req.url === '/api/auth/register') {
    try {
      const body = await readJsonBody(req)
      const email = normalizeEmail(body.email)
      const password = normalizePassword(body.password)
      const displayName = normalizeDisplayName(body.displayName)

      if (!email || !password || !displayName) {
        json(res, 400, { error: 'Display name, email, and password are required.' })
        return
      }

      if (!emailPattern.test(email)) {
        json(res, 400, { error: 'Enter a valid email address.' })
        return
      }

      if (displayName.length < 2) {
        json(res, 400, { error: 'Display name must be at least 2 characters.' })
        return
      }

      if (password.length < 8) {
        json(res, 400, { error: 'Password must be at least 8 characters.' })
        return
      }

      const users = loadUsers()
      if (users.some((user) => user.email.toLowerCase() === email)) {
        json(res, 409, { error: 'An account with that email already exists.' })
        return
      }

      const newUser = {
        id: generateUserId(),
        email,
        passwordHash: hashPassword(password),
        displayName,
        createdAt: new Date().toISOString(),
      }

      saveUsers([...users, newUser])
      const authUser = toAuthUser(newUser)
      const session = createSession(authUser)
      setCookie(res, sessionCookieName, session.id, { maxAge: 60 * 60 * 24 * 30 })
      json(res, 201, { user: authUser })
      return
    } catch {
      json(res, 400, { error: 'Account creation failed.' })
      return
    }
  }

  if (req.method === 'POST' && req.url === '/api/auth/login') {
    try {
      const body = await readJsonBody(req)
      const email = normalizeEmail(body.email)
      const password = normalizePassword(body.password)

      if (!email || !password) {
        json(res, 400, { error: 'Email and password are required.' })
        return
      }

      const users = loadUsers()
      const user = users.find((entry) => entry.email.toLowerCase() === email)

      if (!user || !verifyPassword(password, user.passwordHash)) {
        json(res, 401, { error: 'Email or password is incorrect.' })
        return
      }

      const authUser = toAuthUser(user)
      const session = createSession(authUser)
      setCookie(res, sessionCookieName, session.id, { maxAge: 60 * 60 * 24 * 30 })
      json(res, 200, { user: authUser })
      return
    } catch {
      json(res, 400, { error: 'Login failed.' })
      return
    }
  }

  if (req.method === 'POST' && req.url === '/api/auth/logout') {
    const session = getSession(req)
    if (session) {
      deleteSessionById(session.id)
    }
    clearCookie(res, sessionCookieName)
    json(res, 200, { ok: true })
    return
  }

  const url = new URL(req.url, `http://localhost:${port}`)
  const path = url.pathname

  if (req.method === 'GET' && path === '/api/matches/me') {
    const currentUser = getCurrentUser(req)

    if (!currentUser || currentUser.isGuest) {
      json(res, 200, { matches: [] })
      return
    }

    const matches = loadMatchResults()
      .filter((match) => match.userId === currentUser.id)
      .sort((left, right) => new Date(right.playedAt).getTime() - new Date(left.playedAt).getTime())

    json(res, 200, { matches })
    return
  }

  if (req.method === 'GET' && path === '/api/profile/me') {
    const currentUser = requireCurrentUser(req, res)
    if (!currentUser) {
      return
    }

    json(res, 200, buildProfileSummary(currentUser))
    return
  }

  if (req.method === 'POST' && path === '/api/matches') {
    try {
      const currentUser = getCurrentUser(req)

      if (!currentUser || currentUser.isGuest) {
        json(res, 403, { error: 'Only signed-in users can save match history.' })
        return
      }

      const body = await readJsonBody(req)
      const matchId = String(body.id ?? '').trim()

      if (!matchId) {
        json(res, 400, { error: 'A match id is required.' })
        return
      }

      const results = loadMatchResults()
      const existingIndex = results.findIndex(
        (entry) => entry.id === matchId && entry.userId === currentUser.id,
      )
      const nextMatch = {
        id: matchId,
        userId: currentUser.id,
        totalScore: Number(body.totalScore ?? 0),
        roundCount: Number(body.roundCount ?? 0),
        roundTime: Number(body.roundTime ?? 0),
        mode: body.mode === 'non-moving' ? 'non-moving' : 'moving',
        matchType: body.matchType === 'team-duel' ? 'team-duel' : 'regular',
        playedAt: String(body.playedAt ?? nowIso()),
      }

      if (existingIndex === -1) {
        results.push(nextMatch)
      } else {
        results[existingIndex] = nextMatch
      }

      saveMatchResults(results)
      json(res, 201, { match: nextMatch })
      return
    } catch {
      json(res, 400, { error: 'Could not save match history.' })
      return
    }
  }

  if (req.method === 'GET' && path === '/api/leaderboard') {
    const windowKey = ['daily', 'monthly', 'all-time'].includes(url.searchParams.get('window') ?? '')
      ? url.searchParams.get('window')
      : 'daily'
    const currentUser = getCurrentUser(req)
    const users = loadUsers()
    const matches = loadMatchResults()
    const groupedMatches = new Map()

    for (const match of matches) {
      if (!isMatchInsideWindow(match, windowKey)) {
        continue
      }

      const currentMatches = groupedMatches.get(match.userId) ?? []
      currentMatches.push(match)
      groupedMatches.set(match.userId, currentMatches)
    }

    const userEntries = users
      .map((user) =>
        buildUserLeaderboardEntry(
          user,
          groupedMatches.get(user.id) ?? [],
          currentUser?.isGuest ? null : currentUser?.id ?? null,
        ),
      )
      .filter(Boolean)

    const mergedEntries = currentUser?.isGuest
      ? [...seededLeaderboardData[windowKey], ...userEntries]
      : [
          ...seededLeaderboardData[windowKey].filter(
            (entry) => entry.name !== currentUser?.displayName,
          ),
          ...userEntries,
        ]

    const entries = withRanks(mergedEntries)
    json(res, 200, { entries })
    return
  }

  if (req.method === 'GET' && path.startsWith('/api/parties/')) {
    const segments = path.split('/').filter(Boolean)
    const code = normalizeCode(segments[2] ?? '')
    if (!isValidPartyCode(code)) {
      json(res, 400, { error: 'Party code is invalid.' })
      return
    }
    const parties = loadParties()
    const party = parties.find((entry) => entry.code === code) ?? null

    if (!party) {
      json(res, 404, { error: 'Party not found.' })
      return
    }

    if (segments.length === 3) {
      json(res, 200, { party: sanitizePartyForClient(party) })
      return
    }

    if (segments.length === 4 && segments[3] === 'chat') {
      json(res, 200, { messages: party.chatMessages ?? [] })
      return
    }

    if (segments.length === 4 && segments[3] === 'reveal') {
      const snapshot = buildRevealSnapshot(party)
      if (!snapshot) {
        json(res, 409, { error: 'Reveal data is not available yet.' })
        return
      }

      json(res, 200, { snapshot })
      return
    }

    if (segments.length === 4 && segments[3] === 'stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      })

      res.write(
        `event: party\ndata: ${JSON.stringify({
          code,
          deleted: false,
          party: sanitizePartyForClient(party),
        })}\n\n`,
      )
      registerPartyStream(code, res)
      return
    }
  }

  if (req.method === 'POST' && path === '/api/parties/create') {
    try {
      const currentUser = requireCurrentUser(req, res)
      if (!currentUser) {
        return
      }

      const body = await readJsonBody(req)
      if (!body.settings) {
        json(res, 400, { error: 'Party leader and settings are required.' })
        return
      }

      const parties = loadParties()
      const currentUserParty = parties.find((entry) =>
        entry.members.some((member) => member.userId === currentUser.id),
      )

      if (currentUserParty) {
        json(res, 409, { error: 'Leave your current party before creating a new one.' })
        return
      }

      const now = nowIso()
      const party = {
        code: generatePartyCode(),
        leaderId: currentUser.id,
        members: [
          {
            userId: currentUser.id,
            displayName: currentUser.displayName,
            isGuest: Boolean(currentUser.isGuest),
            joinedAt: now,
            team: 'red',
          },
        ],
        settings: sanitizePartySettings(body.settings),
        activeMatch: null,
        chatMessages: [],
        createdAt: now,
        updatedAt: now,
      }

      parties.push(party)
      persistParties(parties, { party })
      json(res, 201, { party: sanitizePartyForClient(party) })
      return
    } catch {
      json(res, 400, { error: 'Could not create party.' })
      return
    }
  }

  if (req.method === 'POST' && path === '/api/parties/join') {
    try {
      const currentUser = requireCurrentUser(req, res)
      if (!currentUser) {
        return
      }

      const body = await readJsonBody(req)
      const code = normalizeCode(body.code)
      if (!isValidPartyCode(code)) {
        json(res, 400, { error: 'Party codes must be 6 letters or numbers.' })
        return
      }
      const parties = loadParties()
      const index = findPartyIndex(parties, code)

      if (index === -1) {
        json(res, 404, { error: 'Party not found.' })
        return
      }

      const party = parties[index]
      if (party.members.length >= maxPartyMembers && !party.members.some((member) => member.userId === currentUser.id)) {
        json(res, 409, { error: 'This party is already full.' })
        return
      }

      const existingMember = party.members.find((member) => member.userId === currentUser.id)

      if (!existingMember) {
        const redCount = party.members.filter((member) => member.team === 'red').length
        const blackCount = party.members.filter((member) => member.team === 'black').length
        const team = redCount <= blackCount ? 'red' : 'black'

        party.members.push({
          userId: currentUser.id,
          displayName: currentUser.displayName,
          isGuest: Boolean(currentUser.isGuest),
          joinedAt: nowIso(),
          team,
        })
        party.updatedAt = nowIso()
      }

      persistParties(parties, { party })
      json(res, 200, { party: sanitizePartyForClient(party) })
      return
    } catch {
      json(res, 400, { error: 'Could not join party.' })
      return
    }
  }

  if (req.method === 'POST' && path === '/api/parties/team/self') {
    try {
      const currentUser = requireCurrentUser(req, res)
      if (!currentUser) {
        return
      }

      const body = await readJsonBody(req)
      const parties = loadParties()
      const index = findPartyIndex(parties, body.code)

      if (index === -1) {
        json(res, 404, { error: 'Party not found.' })
        return
      }

      const party = parties[index]
      if (party.settings.matchType !== 'team-duel') {
        json(res, 409, { error: 'Team selection is only available in Team Duel.' })
        return
      }
      if (party.settings.teamChoiceLocked) {
        json(res, 403, { error: 'The leader has locked team selection.' })
        return
      }

      const member = party.members.find((entry) => entry.userId === currentUser.id)
      if (!member) {
        json(res, 404, { error: 'Player not found in this party.' })
        return
      }

      member.team = body.team === 'black' ? 'black' : 'red'
      party.updatedAt = nowIso()
      persistParties(parties, { party })
      json(res, 200, { party: sanitizePartyForClient(party) })
      return
    } catch {
      json(res, 400, { error: 'Could not change team.' })
      return
    }
  }

  if (req.method === 'POST' && path === '/api/parties/team/assign') {
    try {
      const currentUser = requireCurrentUser(req, res)
      if (!currentUser) {
        return
      }

      const body = await readJsonBody(req)
      const parties = loadParties()
      const index = findPartyIndex(parties, body.code)
      if (index === -1) {
        json(res, 404, { error: 'Party not found.' })
        return
      }

      const party = parties[index]
      if (party.leaderId !== currentUser.id) {
        json(res, 403, { error: 'Only the leader can assign teams.' })
        return
      }

      const member = party.members.find((entry) => entry.userId === body.memberId)
      if (!member) {
        json(res, 404, { error: 'Player not found in this party.' })
        return
      }

      member.team = body.team === 'black' ? 'black' : 'red'
      party.updatedAt = nowIso()
      persistParties(parties, { party })
      json(res, 200, { party: sanitizePartyForClient(party) })
      return
    } catch {
      json(res, 400, { error: 'Could not assign team.' })
      return
    }
  }

  if (req.method === 'POST' && path === '/api/parties/settings') {
    try {
      const currentUser = requireCurrentUser(req, res)
      if (!currentUser) {
        return
      }

      const body = await readJsonBody(req)
      const parties = loadParties()
      const index = findPartyIndex(parties, body.code)
      if (index === -1) {
        json(res, 404, { error: 'Party not found.' })
        return
      }

      const party = parties[index]
      if (party.leaderId !== currentUser.id) {
        json(res, 403, { error: 'Only the leader can change party settings.' })
        return
      }
      if (party.activeMatch && party.activeMatch.status !== 'finished') {
        json(res, 409, { error: 'Finish the current match before changing settings.' })
        return
      }

      party.settings = sanitizePartySettings({
        ...party.settings,
        ...body.settings,
      })
      party.updatedAt = nowIso()
      persistParties(parties, { party })
      json(res, 200, { party: sanitizePartyForClient(party) })
      return
    } catch {
      json(res, 400, { error: 'Could not update party settings.' })
      return
    }
  }

  if (req.method === 'POST' && path === '/api/parties/kick') {
    try {
      const currentUser = requireCurrentUser(req, res)
      if (!currentUser) {
        return
      }

      const body = await readJsonBody(req)
      const parties = loadParties()
      const index = findPartyIndex(parties, body.code)
      if (index === -1) {
        json(res, 404, { error: 'Party not found.' })
        return
      }

      const party = parties[index]
      if (party.leaderId !== currentUser.id) {
        json(res, 403, { error: 'Only the leader can remove players.' })
        return
      }
      if (body.memberId === currentUser.id) {
        json(res, 409, { error: 'The leader cannot kick themselves.' })
        return
      }

      party.members = party.members.filter((member) => member.userId !== body.memberId)
      party.updatedAt = nowIso()
      persistParties(parties, { party })
      json(res, 200, { party: sanitizePartyForClient(party) })
      return
    } catch {
      json(res, 400, { error: 'Could not kick player.' })
      return
    }
  }

  if (req.method === 'POST' && path === '/api/parties/leave') {
    try {
      const currentUser = requireCurrentUser(req, res)
      if (!currentUser) {
        return
      }

      const body = await readJsonBody(req)
      const parties = loadParties()
      const index = findPartyIndex(parties, body.code)
      if (index === -1) {
        json(res, 200, { party: null })
        return
      }

      const party = parties[index]
      party.members = party.members.filter((member) => member.userId !== currentUser.id)

      if (party.members.length === 0) {
        parties.splice(index, 1)
        persistParties(parties, { deletedCode: body.code })
        json(res, 200, { party: null })
        return
      }

      if (party.leaderId === currentUser.id) {
        party.leaderId = party.members[0].userId
      }

      party.updatedAt = nowIso()
      persistParties(parties, { party })
      json(res, 200, { party: sanitizePartyForClient(party) })
      return
    } catch {
      json(res, 400, { error: 'Could not leave party.' })
      return
    }
  }

  if (req.method === 'POST' && path === '/api/parties/start') {
    try {
      const currentUser = requireCurrentUser(req, res)
      if (!currentUser) {
        return
      }

      const body = await readJsonBody(req)
      const parties = loadParties()
      const index = findPartyIndex(parties, body.code)
      if (index === -1) {
        json(res, 404, { error: 'Party not found.' })
        return
      }

      const party = parties[index]
      if (party.leaderId !== currentUser.id) {
        json(res, 403, { error: 'Only the leader can start the match.' })
        return
      }

      if (party.settings.matchType === 'team-duel') {
        const redCount = party.members.filter((member) => member.team === 'red').length
        const blackCount = party.members.filter((member) => member.team === 'black').length
        if (redCount === 0 || blackCount === 0) {
          json(res, 409, { error: 'Team Duel needs at least one player on each team.' })
          return
        }
      }

      const currentTime = nowIso()
      const mapsApiKey =
        process.env.GOOGLE_MAPS_API_KEY?.trim() ||
        process.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ||
        ''
      const roundPlanTargets = await buildServerRoundPlan({
        roundCount: Number(party.settings.roundCount),
        apiKey: mapsApiKey,
      })
      const target = roundPlanTargets[0]

      party.activeMatch = {
        matchId: randomUUID(),
        status: 'playing',
        currentRound: 1,
        matchType: party.settings.matchType,
        mode: party.settings.mode,
        roundTime: party.settings.roundTime,
        roundCount: party.settings.roundCount,
        targetId: target.id,
        targetName: target.name,
        targetView: createTargetView(target),
        usedTargetIds: [target.id],
        roundPlanTargets,
        roundStartedAt: currentTime,
        submissions: [],
        totalScores: createDefaultTotals(party.members),
        roundResults: [],
        initialPoints: Number(party.settings.initialPoints),
        damageStartRound: Number(party.settings.damageStartRound),
        damageIncrement: Number(party.settings.damageIncrement),
        teamChoiceLocked: Boolean(party.settings.teamChoiceLocked),
        teamPoints: {
          red: Number(party.settings.initialPoints),
          black: Number(party.settings.initialPoints),
        },
        winnerTeam: null,
        updatedAt: currentTime,
      }
      party.updatedAt = currentTime
      persistParties(parties, { party })
      json(res, 200, { party: sanitizePartyForClient(party) })
      return
    } catch {
      json(res, 400, { error: 'Could not start match.' })
      return
    }
  }

  if (req.method === 'POST' && path === '/api/parties/submit') {
    try {
      const currentUser = requireCurrentUser(req, res)
      if (!currentUser) {
        return
      }

      const body = await readJsonBody(req)
      const parties = loadParties()
      const index = findPartyIndex(parties, body.code)
      if (index === -1) {
        json(res, 404, { error: 'Party not found.' })
        return
      }

      const party = parties[index]
      const match = party.activeMatch
      if (!match || match.status !== 'playing') {
        json(res, 409, { error: 'This party is not currently in a playable round.' })
        return
      }

      const member = party.members.find((entry) => entry.userId === currentUser.id)
      if (!member) {
        json(res, 404, { error: 'Player not found in this party.' })
        return
      }

      const nextGuess = parseGuess(body.guess)
      if (body.guess && !nextGuess) {
        json(res, 400, { error: 'Guess coordinates are invalid.' })
        return
      }

      upsertSubmission(match.submissions, {
        userId: currentUser.id,
        guess: nextGuess,
        timedOut: Boolean(body.timedOut),
        submittedAt: nowIso(),
      })
      match.updatedAt = nowIso()
      party.updatedAt = match.updatedAt

      const everyoneSubmitted = party.members.every((entry) =>
        match.submissions.some((submission) => submission.userId === entry.userId),
      )

      if (everyoneSubmitted) {
        finalizeRevealRound(party)
      }

      persistParties(parties, { party })
      json(res, 200, { party: sanitizePartyForClient(party) })
      return
    } catch {
      json(res, 400, { error: 'Could not submit guess.' })
      return
    }
  }

  if (req.method === 'POST' && path === '/api/parties/reveal') {
    try {
      const currentUser = requireCurrentUser(req, res)
      if (!currentUser) {
        return
      }

      const body = await readJsonBody(req)
      const parties = loadParties()
      const index = findPartyIndex(parties, body.code)
      if (index === -1) {
        json(res, 404, { error: 'Party not found.' })
        return
      }

      const party = parties[index]
      if (!party.members.some((member) => member.userId === currentUser.id)) {
        json(res, 403, { error: 'You are not in this party.' })
        return
      }

      if (party.activeMatch?.status === 'playing') {
        finalizeRevealRound(party)
      }

      persistParties(parties, { party })
      json(res, 200, { party: sanitizePartyForClient(party) })
      return
    } catch {
      json(res, 400, { error: 'Could not reveal round.' })
      return
    }
  }

  if (req.method === 'POST' && path === '/api/parties/advance') {
    try {
      const currentUser = requireCurrentUser(req, res)
      if (!currentUser) {
        return
      }

      const body = await readJsonBody(req)
      const parties = loadParties()
      const index = findPartyIndex(parties, body.code)
      if (index === -1) {
        json(res, 404, { error: 'Party not found.' })
        return
      }

      const party = parties[index]
      const match = party.activeMatch
      if (!match) {
        json(res, 409, { error: 'There is no active match to advance.' })
        return
      }
      if (party.leaderId !== currentUser.id) {
        json(res, 403, { error: 'Only the leader can advance the match.' })
        return
      }

      const totalRounds = Number(match.roundCount)
      const shouldFinish =
        match.currentRound >= totalRounds || (match.matchType === 'team-duel' && match.winnerTeam)

      if (shouldFinish) {
        match.status = 'finished'
        match.updatedAt = nowIso()
        party.updatedAt = match.updatedAt
        persistCompletedPartyMatchResults(party)
        persistParties(parties, { party })
        json(res, 200, { party: sanitizePartyForClient(party) })
        return
      }

      const nextTarget =
        match.roundPlanTargets?.[match.currentRound] ??
        (
          await buildServerRoundPlan({
            roundCount: 1,
            excludedTargetIds: match.usedTargetIds,
            apiKey:
              process.env.GOOGLE_MAPS_API_KEY?.trim() ||
              process.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ||
              '',
          })
        )[0]
      match.status = 'playing'
      match.currentRound += 1
      match.targetId = nextTarget.id
      match.targetName = nextTarget.name
      match.targetView = createTargetView(nextTarget)
      match.usedTargetIds = [...match.usedTargetIds, nextTarget.id]
      match.roundStartedAt = nowIso()
      match.submissions = []
      match.updatedAt = match.roundStartedAt
      party.updatedAt = match.updatedAt

      persistParties(parties, { party })
      json(res, 200, { party: sanitizePartyForClient(party) })
      return
    } catch {
      json(res, 400, { error: 'Could not advance match.' })
      return
    }
  }

  if (req.method === 'POST' && path.match(/^\/api\/parties\/[^/]+\/chat$/)) {
    try {
      const currentUser = requireCurrentUser(req, res)
      if (!currentUser) {
        return
      }

      const body = await readJsonBody(req)
      const code = normalizeCode(path.split('/')[3] ?? body.code)
      const parties = loadParties()
      const index = findPartyIndex(parties, code)
      if (index === -1) {
        json(res, 404, { error: 'Party not found.' })
        return
      }

      const party = parties[index]
      if (!party.members.some((member) => member.userId === currentUser.id)) {
        json(res, 403, { error: 'You are not in this party.' })
        return
      }

      const messageBody = String(body.body ?? '').trim()
      if (!messageBody) {
        json(res, 400, { error: 'Message body cannot be empty.' })
        return
      }

      if (messageBody.length > maxChatMessageLength) {
        json(res, 400, { error: `Messages can be at most ${maxChatMessageLength} characters.` })
        return
      }

      const chatMessages = party.chatMessages ?? []
      chatMessages.push({
        id: randomUUID(),
        userId: currentUser.id,
        displayName: currentUser.displayName,
        body: messageBody,
        sentAt: nowIso(),
      })

      party.chatMessages = chatMessages.slice(-200)
      party.updatedAt = nowIso()
      persistParties(parties, { party })
      json(res, 200, { messages: party.chatMessages })
      return
    } catch {
      json(res, 400, { error: 'Could not send chat message.' })
      return
    }
  }

  if (req.method === 'GET' && !path.startsWith('/api/')) {
    if (tryServeStatic(req, res, path)) {
      return
    }
  }

  json(res, 404, { error: 'Not found.' })
})

setInterval(() => {
  try {
    cleanupStaleState()
  } catch (error) {
    console.error('Background state cleanup failed:', error)
  }
}, 5000)

async function startServer() {
  await initializeDatabase()

  server.listen(port, () => {
    logRuntimeChecks()
    console.log(`Mueyyensayt API listening on ${publicBaseUrl}`)
  })
}

startServer().catch((error) => {
  console.error('Failed to start Mueyyensayt server:', error)
  process.exit(1)
})
