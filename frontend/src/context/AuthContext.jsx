import { createContext, useContext, useEffect, useState } from 'react'
import * as authApi from '../api/auth'
import { getMe } from '../api/users'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token)
      getMe()
        .then(({ data }) => setUser(data))
        .catch(() => {
          localStorage.removeItem('token')
          setToken(null)
        })
    } else {
      localStorage.removeItem('token')
      setUser(null)
    }
  }, [token])

  async function login(email, password) {
    setLoading(true)
    try {
      const { data } = await authApi.login(email, password)
      setToken(data.access_token)
    } finally {
      setLoading(false)
    }
  }

  async function signup(orgName, email, password, inviteToken = null) {
    setLoading(true)
    try {
      await authApi.signup(orgName, email, password, inviteToken)
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    setToken(null)
  }

  async function refreshUser() {
    try {
      const { data } = await getMe()
      setUser(data)
    } catch {
      // silently ignore — if the token is bad the useEffect will catch it
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, signup, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
