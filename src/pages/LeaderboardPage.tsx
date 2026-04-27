import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { loadLeaderboardEntries } from '../lib/auth'

type LeaderboardWindow = 'daily' | 'monthly' | 'all-time'

type LeaderboardEntry = {
  rank: number
  name: string
  country: string
  score: number
  winRate: number
  roundsPlayed: number
  streak: number
  isCurrentUser?: boolean
}

const windowLabels: Record<LeaderboardWindow, string> = {
  daily: 'Daily',
  monthly: 'Monthly',
  'all-time': 'All-time',
}

function formatScore(score: number) {
  return score.toLocaleString()
}

export function LeaderboardPage() {
  const [selectedWindow, setSelectedWindow] = useState<LeaderboardWindow>('daily')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  useEffect(() => {
    let cancelled = false

    async function hydrateLeaderboard() {
      try {
        setError(null)
        const payload = await loadLeaderboardEntries(selectedWindow)
        if (!cancelled) {
          setEntries(payload.entries)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Could not load leaderboard.')
        }
      }
    }

    void hydrateLeaderboard()

    return () => {
      cancelled = true
    }
  }, [selectedWindow, user])

  const topThree = useMemo(() => entries.slice(0, 3), [entries])
  const rest = useMemo(() => entries.slice(3), [entries])
  const currentUserEntry = entries.find((entry) => entry.isCurrentUser)

  return (
    <main className="app-shell">
      <section className="hero leaderboard-hero">
        <p className="eyebrow">Rankings</p>
        <h1>Leaderboard</h1>
        <p className="hero-copy">
          Track who is dominating today, this month, and across the whole lifetime of the game.
        </p>

        {user ? (
          <div className="home-user-banner leaderboard-user-banner">
            <span>{user.isGuest ? 'Guest session' : 'Current player'}</span>
            <strong>{user.displayName}</strong>
            <small>
              {user.isGuest
                ? 'Guest matches are not saved permanently.'
                : currentUserEntry
                  ? `Current ${windowLabels[selectedWindow].toLowerCase()} rank: #${currentUserEntry.rank}`
                  : `No saved ${windowLabels[selectedWindow].toLowerCase()} matches yet.`}
            </small>
          </div>
        ) : null}

        <div className="leaderboard-window-toggle" role="tablist" aria-label="Leaderboard window">
          {(['daily', 'monthly', 'all-time'] as LeaderboardWindow[]).map((windowKey) => (
            <button
              key={windowKey}
              type="button"
              className={
                selectedWindow === windowKey
                  ? 'leaderboard-window-option active'
                  : 'leaderboard-window-option'
              }
              onClick={() => setSelectedWindow(windowKey)}
            >
              {windowLabels[windowKey]}
            </button>
          ))}
        </div>

        {error ? <p className="auth-error">{error}</p> : null}

        <section className="leaderboard-podium">
          {topThree.map((entry) => (
            <article
              key={entry.rank}
              className={`leaderboard-podium-card place-${entry.rank}${entry.isCurrentUser ? ' current-user' : ''}`}
            >
              <span className="leaderboard-place">#{entry.rank}</span>
              <strong>{entry.name}</strong>
              <p>
                {entry.country} - {entry.roundsPlayed} rounds
              </p>
              <div className="leaderboard-podium-score">{formatScore(entry.score)}</div>
            </article>
          ))}
        </section>

        <section className="leaderboard-table-shell">
          <div className="leaderboard-table-header">
            <span>Rank</span>
            <span>Player</span>
            <span>Score</span>
            <span>Win rate</span>
            <span>Streak</span>
          </div>

          <div className="leaderboard-table-list">
            {rest.map((entry) => (
              <article
                key={entry.rank}
                className={`leaderboard-table-row${entry.isCurrentUser ? ' current-user-row' : ''}`}
              >
                <span>#{entry.rank}</span>
                <div className="leaderboard-player">
                  <strong>{entry.name}</strong>
                  <small>
                    {entry.country} - {entry.roundsPlayed} rounds
                  </small>
                </div>
                <span>{formatScore(entry.score)}</span>
                <span>{entry.winRate}%</span>
                <span>{entry.streak} wins</span>
              </article>
            ))}
          </div>
        </section>

        <div className="hero-actions">
          <Link to="/" className="button-link secondary">
            Back
          </Link>
        </div>
      </section>
    </main>
  )
}
