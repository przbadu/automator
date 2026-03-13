import { useCallback, useEffect, useState } from "react"
import type { User } from "@/types"
import { API_URL, clearTokens, fetchWithAuth, getTokens, setTokens } from "@/lib/api"

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    const { access } = getTokens()
    if (!access) {
      setLoading(false)
      return
    }
    try {
      const res = await fetchWithAuth("/auth/me")
      if (res.ok) {
        setUser(await res.json())
      } else {
        clearTokens()
      }
    } catch {
      clearTokens()
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.detail || "Login failed")
    }
    const data = await res.json()
    setTokens(data.access_token, data.refresh_token)
    await fetchUser()
  }

  const signup = async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.detail || "Signup failed")
    }
    const data = await res.json()
    setTokens(data.access_token, data.refresh_token)
    await fetchUser()
  }

  const logout = () => {
    clearTokens()
    setUser(null)
  }

  return { user, loading, login, signup, logout }
}
