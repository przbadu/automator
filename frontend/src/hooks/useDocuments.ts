import { useCallback, useEffect, useRef, useState } from "react"
import type { Document, UploadResult } from "@/types"
import { API_URL, fetchWithAuth } from "@/lib/api"

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [uploading, setUploading] = useState(false)
  const eventSourceRef = useRef<AbortController | null>(null)

  const loadDocuments = useCallback(async () => {
    const res = await fetchWithAuth("/documents")
    if (res.ok) {
      const data = await res.json()
      setDocuments(data.documents)
    }
  }, [])

  const uploadDocument = useCallback(
    async (file: File): Promise<UploadResult> => {
      setUploading(true)
      try {
        const formData = new FormData()
        formData.append("file", file)
        const res = await fetchWithAuth("/documents/upload", {
          method: "POST",
          body: formData,
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "Upload failed" }))
          throw new Error(err.detail || "Upload failed")
        }
        const doc = (await res.json()) as Document & { duplicate?: boolean; updated?: boolean }

        if (doc.duplicate) {
          return { doc, message: "File already exists (identical content)", variant: "info" }
        }
        if (doc.updated) {
          setDocuments((prev) =>
            prev.map((d) => (d.id === doc.id ? doc : d))
          )
          return { doc, message: "Document updated with new content", variant: "warning" }
        }

        // Check if document already exists (e.g. retry of failed/pending upload)
        setDocuments((prev) => {
          const exists = prev.some((d) => d.id === doc.id)
          if (exists) {
            return prev.map((d) => (d.id === doc.id ? doc : d))
          }
          return [doc, ...prev]
        })
        return { doc, message: "Document uploaded successfully", variant: "success" }
      } finally {
        setUploading(false)
      }
    },
    [],
  )

  const deleteDocument = useCallback(async (id: string) => {
    const res = await fetchWithAuth(`/documents/${id}`, { method: "DELETE" })
    if (res.ok) {
      setDocuments((prev) => prev.filter((d) => d.id !== id))
    }
  }, [])

  // SSE status stream
  useEffect(() => {
    const controller = new AbortController()
    eventSourceRef.current = controller

    const token = localStorage.getItem("access_token")
    if (!token) return

    const connect = async () => {
      try {
        const res = await fetch(`${API_URL}/documents/status/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        if (!res.ok || !res.body) return

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event = JSON.parse(line.slice(6))
                if (event.type === "status_update" && event.status !== "skipped") {
                  // For terminal states, refetch the full document to get all fields (metadata, etc.)
                  if (event.status === "completed" || event.status === "failed") {
                    fetchWithAuth(`/documents/${event.document_id}`)
                      .then((r) => r.ok ? r.json() : null)
                      .then((doc) => {
                        if (doc) {
                          setDocuments((prev) =>
                            prev.map((d) => (d.id === doc.id ? doc : d))
                          )
                        }
                      })
                      .catch(() => {})
                  } else {
                    setDocuments((prev) =>
                      prev.map((d) =>
                        d.id === event.document_id
                          ? {
                              ...d,
                              status: event.status,
                              chunk_count: event.chunk_count ?? d.chunk_count,
                              error_message: event.error_message ?? d.error_message,
                            }
                          : d,
                      ),
                    )
                  }
                }
              } catch {
                // ignore parse errors
              }
            }
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
      }
    }

    connect()

    return () => {
      controller.abort()
    }
  }, [])

  return { documents, uploading, loadDocuments, uploadDocument, deleteDocument }
}
