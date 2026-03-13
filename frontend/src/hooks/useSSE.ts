import { useCallback, useRef, useState } from "react"
import { getTokens } from "@/lib/api"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"

interface SSEDelta {
  type: "delta" | "done"
  content?: string
  message_id?: string | null
  thread_title?: string | null
  stopped?: boolean
}

export function useSSE() {
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const threadIdRef = useRef<string | null>(null)

  const streamMessage = useCallback(
    async (
      threadId: string,
      content: string,
      onDelta: (text: string) => void,
      onDone: (messageId: string | null, threadTitle?: string | null, stopped?: boolean) => void,
    ) => {
      setStreaming(true)
      const controller = new AbortController()
      abortRef.current = controller
      threadIdRef.current = threadId

      try {
        const { access } = getTokens()
        const res = await fetch(`${API_URL}/threads/${threadId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${access}`,
          },
          body: JSON.stringify({ content }),
          signal: controller.signal,
        })

        if (!res.ok) throw new Error("Failed to send message")

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const jsonStr = line.slice(6).trim()
            if (!jsonStr) continue

            const data: SSEDelta = JSON.parse(jsonStr)
            if (data.type === "delta" && data.content) {
              onDelta(data.content)
            } else if (data.type === "done") {
              onDone(data.message_id ?? null, data.thread_title, data.stopped)
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("SSE error:", err)
        }
        // For AbortError (after /stop), onDone will have been called by the
        // server's clean shutdown, or the caller handles reload separately
      } finally {
        setStreaming(false)
        abortRef.current = null
        threadIdRef.current = null
      }
    },
    [],
  )

  const stop = useCallback(async () => {
    const threadId = threadIdRef.current
    if (!threadId) return

    // Tell the backend to stop the LLM stream
    try {
      const { access } = getTokens()
      await fetch(`${API_URL}/threads/${threadId}/stop`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access}`,
        },
      })
    } catch {
      // If the stop request fails, fall back to aborting
    }
  }, [])

  return { streaming, streamMessage, stop }
}
