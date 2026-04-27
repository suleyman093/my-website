import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import {
  createGuestUserFromServer,
  loginWithServer,
  loadCurrentSessionUser,
  logoutFromServer,
  registerWithServer,
} from './auth'
import type { AuthUser } from './auth'

type AuthContextValue = {
  user: AuthUser | null
  isAuthenticated: boolean
  register: (input: {
    email: string
    password: string
    displayName: string
  }) => Promise<AuthUser>
  login: (input: { email: string; password: string }) => Promise<AuthUser>
  continueAsGuest: () => Promise<AuthUser>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    let cancelled = false

    async function hydrateSession() {
      try {
        const nextUser = await loadCurrentSessionUser()
        if (!cancelled) {
          setUser(nextUser)
        }
      } catch {
        if (!cancelled) {
          setUser(null)
        }
      }
    }

    void hydrateSession()

    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      async register(input) {
        const nextUser = await registerWithServer(input)
        setUser(nextUser)
        return nextUser
      },
      async login(input) {
        const nextUser = await loginWithServer(input)
        setUser(nextUser)
        return nextUser
      },
      async continueAsGuest() {
        const nextUser = await createGuestUserFromServer()
        setUser(nextUser)
        return nextUser
      },
      async logout() {
        await logoutFromServer()
        setUser(null)
      },
    }),
    [user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.')
  }

  return context
}
