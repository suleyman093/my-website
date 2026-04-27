import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { loadProfileSummary, type ProfileSummary } from '../lib/auth'

function formatScore(score: number) {
  return score.toLocaleString()
}

function formatPlayedAt(value: string | null) {
  if (!value) {
    return 'No matches yet'
  }

  return new Date(value).toLocaleString()
}

export function AccountPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<ProfileSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true })
      return
    }

    let cancelled = false

    async function hydrateProfile() {
      try {
        setLoading(true)
        setError(null)
        const nextProfile = await loadProfileSummary()
        if (!cancelled) {
          setProfile(nextProfile)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Could not load account profile.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void hydrateProfile()

    return () => {
      cancelled = true
    }
  }, [navigate, user])

  const summary = profile?.summary
  const recentMatches = profile?.recentMatches ?? []
  const bestModeLabel = useMemo(() => {
    if (!summary?.bestMode) {
      return 'None yet'
    }

    return summary.bestMode === 'non-moving' ? 'No Move' : 'Moving'
  }, [summary?.bestMode])

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <main className="app-shell home-screen account-screen">
      <div className="home-stars" aria-hidden="true" />
      <div className="home-stars home-stars-secondary" aria-hidden="true" />
      <div className="space-planets" aria-hidden="true">
        <div className="space-planet planet-one" />
        <div className="space-planet planet-two" />
        <div className="space-planet planet-three" />
        <div className="space-planet planet-four" />
      </div>
      <div className="home-earth-wrap result-earth-wrap" aria-hidden="true">
        <div className="home-earth-glow" />
        <div className="home-earth" />
      </div>

      <section className="hero account-hero">
        <p className="eyebrow">Account</p>
        <h1>Your profile</h1>
        <p className="hero-copy">
          Keep track of your identity, match history, and long-term progress in one place.
        </p>

        {user ? (
          <div className="home-user-banner leaderboard-user-banner">
            <span>{user.isGuest ? 'Guest account' : 'Saved account'}</span>
            <strong>{user.displayName}</strong>
            <small>{user.email ?? 'Temporary account - not stored permanently.'}</small>
          </div>
        ) : null}

        {error ? <p className="auth-error">{error}</p> : null}

        {loading ? (
          <div className="setup-summary">
            <p>Loading profile...</p>
          </div>
        ) : summary ? (
          <>
            <div className="result-summary-row final-summary-row account-summary-row">
              <div className="result-stat-card">
                <span>Matches</span>
                <strong>{summary.matchesPlayed}</strong>
              </div>
              <div className="result-stat-card">
                <span>Rounds</span>
                <strong>{summary.roundsPlayed}</strong>
              </div>
              <div className="result-stat-card">
                <span>Total score</span>
                <strong>{formatScore(summary.totalScore)}</strong>
              </div>
              <div className="result-stat-card">
                <span>Average</span>
                <strong>{formatScore(summary.averageScore)}</strong>
              </div>
            </div>

            <div className="setup-summary account-detail-summary">
              <p>
                <strong>Best score:</strong> {formatScore(summary.bestScore)}
              </p>
              <p>
                <strong>Best mode:</strong> {bestModeLabel}
              </p>
              <p>
                <strong>Regular matches:</strong> {summary.regularMatches}
              </p>
              <p>
                <strong>Team Duels:</strong> {summary.teamDuelMatches}
              </p>
              <p>
                <strong>Last played:</strong> {formatPlayedAt(summary.lastPlayedAt)}
              </p>
            </div>

            <div className="final-results-panel account-history-panel">
              <div className="final-results-header">
                <span>Played</span>
                <span>Type</span>
                <span>Mode</span>
                <span>Rounds</span>
                <span>Score</span>
              </div>

              <div className="final-results-list">
                {recentMatches.length > 0 ? (
                  recentMatches.map((match) => (
                    <div key={`${match.id}-${match.playedAt}`} className="final-results-row">
                      <span>{new Date(match.playedAt).toLocaleDateString()}</span>
                      <strong>{match.matchType === 'team-duel' ? 'Team Duel' : 'Regular'}</strong>
                      <span>{match.mode === 'non-moving' ? 'No Move' : 'Moving'}</span>
                      <span>{match.roundCount}</span>
                      <span>{formatScore(match.totalScore)}</span>
                    </div>
                  ))
                ) : (
                  <div className="final-results-row empty-history-row">
                    <span>No saved matches yet.</span>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}

        <div className="hero-actions">
          <Link to="/play" className="button-link">
            Play
          </Link>
          <Link to="/leaderboard" className="button-link secondary">
            Leaderboard
          </Link>
          <button type="button" className="secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </section>
    </main>
  )
}
