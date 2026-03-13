import { useCallback, useState } from "react"
import type { MetadataFieldDefinition, MetadataSchema } from "@/types"
import { fetchWithAuth } from "@/lib/api"

export function useMetadataSchema() {
  const [schema, setSchema] = useState<MetadataSchema | null>(null)
  const [loading, setLoading] = useState(false)

  const loadSchema = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithAuth("/metadata-schemas")
      if (res.ok) {
        setSchema(await res.json())
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const saveSchema = useCallback(async (fields: MetadataFieldDefinition[]) => {
    const res = await fetchWithAuth("/metadata-schemas", {
      method: "PUT",
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to save schema" }))
      throw new Error(err.detail || "Failed to save schema")
    }
    const updated: MetadataSchema = await res.json()
    setSchema(updated)
    return updated
  }, [])

  const resetToDefaults = useCallback(async () => {
    const res = await fetchWithAuth("/metadata-schemas", { method: "DELETE" })
    if (res.ok || res.status === 204) {
      // Reload to get default fields
      const getRes = await fetchWithAuth("/metadata-schemas")
      if (getRes.ok) {
        setSchema(await getRes.json())
      }
    }
  }, [])

  const loadDefaults = useCallback(async (): Promise<MetadataFieldDefinition[]> => {
    const res = await fetchWithAuth("/metadata-schemas/defaults")
    if (res.ok) {
      return await res.json()
    }
    return []
  }, [])

  return { schema, loading, loadSchema, saveSchema, resetToDefaults, loadDefaults }
}
