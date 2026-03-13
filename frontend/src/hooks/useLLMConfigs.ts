import { useCallback, useState } from "react"
import type { LLMConfig, LLMConfigCreateInput, LLMConfigUpdateInput } from "@/types"
import { fetchWithAuth } from "@/lib/api"

export function useLLMConfigs() {
  const [configs, setConfigs] = useState<LLMConfig[]>([])
  const [loading, setLoading] = useState(false)

  const loadConfigs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithAuth("/llm-configs")
      if (res.ok) {
        setConfigs(await res.json())
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const createConfig = useCallback(async (data: LLMConfigCreateInput) => {
    const res = await fetchWithAuth("/llm-configs", {
      method: "POST",
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to create config" }))
      throw new Error(err.detail || "Failed to create config")
    }
    const config: LLMConfig = await res.json()
    setConfigs((prev) => [config, ...prev.map((c) => (config.is_default ? { ...c, is_default: false } : c))])
    return config
  }, [])

  const updateConfig = useCallback(async (id: string, data: LLMConfigUpdateInput) => {
    const res = await fetchWithAuth(`/llm-configs/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to update config" }))
      throw new Error(err.detail || "Failed to update config")
    }
    const updated: LLMConfig = await res.json()
    setConfigs((prev) =>
      prev.map((c) => {
        if (c.id === id) return updated
        if (updated.is_default) return { ...c, is_default: false }
        return c
      }),
    )
    return updated
  }, [])

  const deleteConfig = useCallback(async (id: string) => {
    const res = await fetchWithAuth(`/llm-configs/${id}`, { method: "DELETE" })
    if (res.ok) {
      setConfigs((prev) => prev.filter((c) => c.id !== id))
      // Reload to get updated default status
      const listRes = await fetchWithAuth("/llm-configs")
      if (listRes.ok) {
        setConfigs(await listRes.json())
      }
    }
  }, [])

  const setDefault = useCallback(async (id: string) => {
    const res = await fetchWithAuth(`/llm-configs/${id}`, {
      method: "PUT",
      body: JSON.stringify({ is_default: true }),
    })
    if (res.ok) {
      const updated: LLMConfig = await res.json()
      setConfigs((prev) =>
        prev.map((c) => ({
          ...c,
          is_default: c.id === updated.id,
        })),
      )
    }
  }, [])

  return { configs, loading, loadConfigs, createConfig, updateConfig, deleteConfig, setDefault }
}
