const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"

function getTokens() {
  return {
    access: localStorage.getItem("access_token"),
    refresh: localStorage.getItem("refresh_token"),
  }
}

function setTokens(access: string, refresh: string) {
  localStorage.setItem("access_token", access)
  localStorage.setItem("refresh_token", refresh)
}

function clearTokens() {
  localStorage.removeItem("access_token")
  localStorage.removeItem("refresh_token")
}

async function refreshTokens(): Promise<boolean> {
  const { refresh } = getTokens()
  if (!refresh) return false

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    if (!res.ok) return false
    const data = await res.json()
    setTokens(data.access_token, data.refresh_token)
    return true
  } catch {
    return false
  }
}

export async function fetchWithAuth(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const { access } = getTokens()

  const headers = new Headers(options.headers)
  if (access) {
    headers.set("Authorization", `Bearer ${access}`)
  }
  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json")
  }

  let res = await fetch(`${API_URL}${path}`, { ...options, headers })

  if (res.status === 401 && access) {
    const refreshed = await refreshTokens()
    if (refreshed) {
      const { access: newAccess } = getTokens()
      headers.set("Authorization", `Bearer ${newAccess}`)
      res = await fetch(`${API_URL}${path}`, { ...options, headers })
    }
  }

  return res
}

export async function fetchDocumentChunks(documentId: string): Promise<import("@/types").ChunkData[]> {
  const res = await fetchWithAuth(`/documents/${documentId}/chunks`)
  if (!res.ok) throw new Error(`Failed to fetch chunks: ${res.status}`)
  return res.json()
}

export { API_URL, getTokens, setTokens, clearTokens }
