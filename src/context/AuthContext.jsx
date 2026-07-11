import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { account, databases, DB_ID, COL, Query, listAll } from '../lib/appwrite'
import { ROLES } from '../lib/roles'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null) // Appwrite account object (includes labels)
  const [profile, setProfile] = useState(null) // profiles document
  const [assignments, setAssignments] = useState([]) // role_assignments docs
  const [loading, setLoading] = useState(true)

  const loadSession = useCallback(async () => {
    try {
      const u = await account.get()
      setUser(u)
      const [profRes, assigns] = await Promise.all([
        databases.listDocuments(DB_ID, COL.PROFILES, [Query.equal('userId', u.$id), Query.limit(1)]),
        listAll(COL.ROLE_ASSIGNMENTS, [Query.equal('userId', u.$id), Query.equal('active', true)]),
      ])
      setProfile(profRes.documents[0] || null)
      setAssignments(assigns)
    } catch {
      setUser(null)
      setProfile(null)
      setAssignments([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  const login = async (email, password) => {
    await account.createEmailPasswordSession(email, password)
    setLoading(true)
    await loadSession()
  }

  const logout = async () => {
    try {
      await account.deleteSession('current')
    } finally {
      setUser(null)
      setProfile(null)
      setAssignments([])
    }
  }

  const roles = user?.labels || []
  const hasRole = (...wanted) => wanted.some((r) => roles.includes(r))
  const isApprover = hasRole(
    ROLES.INTERNAL_VERIFIER,
    ROLES.MODULE_LEADER,
    ROLES.LEVEL_COORDINATOR,
    ROLES.MODERATOR,
    ROLES.HOD,
  )

  return (
    <AuthContext.Provider
      value={{ user, profile, assignments, roles, loading, login, logout, hasRole, isApprover, refresh: loadSession }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
