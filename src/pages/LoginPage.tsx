import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useEffect } from 'react'
import { loadCurrentAppState, requestPasswordReset, resetPasswordWithToken } from '../lib/auth'
import {
  buildFinalMatchStateFromParty,
  buildGameRouteStateFromParty,
  buildResultRouteStateFromParty,
} from '../lib/matchResume'

type AuthView = 'login' | 'register'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, login, register, continueAsGuest, logout } = useAuth()
  const [view, setView] = useState<AuthView>('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotMode, setForgotMode] = useState(false)
  const resetToken = new URLSearchParams(location.search).get('reset')?.trim() ?? ''

  useEffect(() => {
    if (!user) {
      return
    }

    const currentUser = user
    let cancelled = false

    async function resume() {
      try {
        const appState = await loadCurrentAppState()
        if (cancelled || !appState.party || !appState.route) {
          return
        }

        if (appState.route === 'room') {
          navigate('/room', { state: { partyCode: appState.party.code } })
          return
        }

        if (appState.route === 'game') {
          const nextState = buildGameRouteStateFromParty(appState.party, currentUser.id)
          if (nextState) {
            navigate('/game', { state: nextState })
          }
          return
        }

        if (appState.route === 'result') {
          const nextState = buildResultRouteStateFromParty(appState.party, currentUser.id)
          if (nextState) {
            navigate('/result', { state: nextState })
          }
          return
        }

        if (appState.route === 'final-result') {
          navigate('/final-result', {
            state: buildFinalMatchStateFromParty(appState.party, currentUser.id),
          })
        }
      } catch {}
    }

    void resume()

    return () => {
      cancelled = true
    }
  }, [navigate, user])

  function resetFields() {
    setDisplayName('')
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setForgotEmail('')
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setInfo(null)

    try {
      await login({ email, password })
      navigate('/play')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Login failed.')
    }
  }

  async function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setInfo(null)

    if (!displayName.trim()) {
      setError('Please choose a display name.')
      return
    }

    if (!email.trim() || !password.trim()) {
      setError('Please fill in email and password.')
      return
    }

    try {
      await register({
        displayName,
        email,
        password,
      })
      navigate('/play')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Account creation failed.')
    }
  }

  async function handleGuestStart() {
    setError(null)
    setInfo(null)
    try {
      await continueAsGuest()
      navigate('/play')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Guest start failed.')
    }
  }

  async function handleForgotPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setInfo(null)

    try {
      await requestPasswordReset(forgotEmail)
      setInfo('If that email exists, a reset link has been sent.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not send reset email.')
    }
  }

  async function handleResetPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setInfo(null)

    if (!password.trim()) {
      setError('Please enter a new password.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    try {
      await resetPasswordWithToken({ token: resetToken, password })
      setInfo('Password updated. You can log in now.')
      setPassword('')
      setConfirmPassword('')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not reset password.')
    }
  }

  return (
    <main className="app-shell">
      <section className="hero auth-hero">
        <p className="eyebrow">Account</p>
        <h1>{user ? 'You are ready to play' : 'Join the game'}</h1>
        <p className="hero-copy">
          Use a saved account for persistent stats, or jump in as a guest with a temporary random
          name.
        </p>

        {user ? (
          <section className="auth-panel current-user-panel">
            <div className="auth-panel-copy">
              <span className="auth-panel-label">{user.isGuest ? 'Guest account' : 'Saved account'}</span>
              <strong>{user.displayName}</strong>
              <p>{user.id}</p>
              <small>{user.email ?? 'Temporary account - not saved permanently'}</small>
            </div>

            <div className="hero-actions auth-actions">
              <button type="button" onClick={() => navigate('/play')}>
                Continue
              </button>
              <button type="button" className="ghost-button" onClick={() => void logout()}>
                Log out
              </button>
            </div>
          </section>
        ) : resetToken ? (
          <section className="auth-panel">
            <div className="auth-panel-copy">
              <span className="auth-panel-label">Reset access</span>
              <strong>Choose a new password</strong>
            </div>

            <form className="auth-form" onSubmit={handleResetPasswordSubmit}>
              <label className="auth-field">
                <span>New password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter a new password"
                />
              </label>

              <label className="auth-field">
                <span>Confirm password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat the new password"
                />
              </label>

              {error ? <p className="auth-error">{error}</p> : null}
              {info ? <p className="auth-success">{info}</p> : null}

              <div className="hero-actions auth-actions">
                <button type="submit">Update password</button>
              </div>
            </form>
          </section>
        ) : forgotMode ? (
          <section className="auth-panel">
            <div className="auth-panel-copy">
              <span className="auth-panel-label">Reset access</span>
              <strong>Forgot your password?</strong>
              <p>Enter your email and we’ll send you a reset link.</p>
            </div>

            <form className="auth-form" onSubmit={handleForgotPasswordSubmit}>
              <label className="auth-field">
                <span>Email</span>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(event) => setForgotEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>

              {error ? <p className="auth-error">{error}</p> : null}
              {info ? <p className="auth-success">{info}</p> : null}

              <div className="hero-actions auth-actions">
                <button type="submit">Send reset link</button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setForgotMode(false)
                    setError(null)
                    setInfo(null)
                  }}
                >
                  Back to login
                </button>
              </div>
            </form>
          </section>
        ) : (
          <>
            <div className="auth-toggle" role="tablist" aria-label="Authentication view">
              <button
                type="button"
                className={view === 'login' ? 'auth-toggle-option active' : 'auth-toggle-option'}
                onClick={() => {
                  setView('login')
                  setError(null)
                  resetFields()
                }}
              >
                Log in
              </button>
              <button
                type="button"
                className={view === 'register' ? 'auth-toggle-option active' : 'auth-toggle-option'}
                onClick={() => {
                  setView('register')
                  setError(null)
                  resetFields()
                }}
              >
                Create account
              </button>
            </div>

            <div className="auth-grid">
              <section className="auth-panel">
                <div className="auth-panel-copy">
                  <span className="auth-panel-label">
                    {view === 'login' ? 'Welcome back' : 'Create your profile'}
                  </span>
                  <strong>{view === 'login' ? 'Saved players' : 'Persistent account'}</strong>
                </div>

                <form
                  className="auth-form"
                  onSubmit={view === 'login' ? handleLoginSubmit : handleRegisterSubmit}
                >
                  {view === 'register' ? (
                    <label className="auth-field">
                      <span>Display name</span>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder="Choose how you appear in-game"
                      />
                    </label>
                  ) : null}

                  <label className="auth-field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                    />
                  </label>

                  <label className="auth-field">
                    <span>Password</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Your password"
                    />
                  </label>

                  {error ? <p className="auth-error">{error}</p> : null}
                  {info ? <p className="auth-success">{info}</p> : null}

                  <div className="hero-actions auth-actions">
                    <button type="submit">
                      {view === 'login' ? 'Log in' : 'Create account'}
                    </button>
                  </div>

                  {view === 'login' ? (
                    <button
                      type="button"
                      className="auth-inline-link"
                      onClick={() => {
                        setForgotMode(true)
                        setError(null)
                        setInfo(null)
                      }}
                    >
                      Forgot your password?
                    </button>
                  ) : null}
                </form>
              </section>

              <section className="auth-panel guest-panel">
                <div className="auth-panel-copy">
                  <span className="auth-panel-label">Fast start</span>
                  <strong>Play as guest</strong>
                  <p>
                    We will create a temporary ID and a random display name for this browser.
                  </p>
                  <small>Guest stats are not permanent and will be replaced when you sign out.</small>
                </div>

                <div className="hero-actions auth-actions">
                  <button type="button" onClick={handleGuestStart}>
                    Continue as guest
                  </button>
                </div>
              </section>
            </div>
          </>
        )}

        <div className="hero-actions">
          <Link to="/" className="button-link secondary">
            Back
          </Link>
        </div>
      </section>
    </main>
  )
}
