import { useCallback, useState } from "react"
import type { Message, Thread } from "@/types"
import { fetchWithAuth } from "@/lib/api"

export function useChat() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [currentThread, setCurrentThread] = useState<Thread | null>(null)
  const [messages, setMessages] = useState<Message[]>([])

  const loadThreads = useCallback(async () => {
    const res = await fetchWithAuth("/threads")
    if (res.ok) {
      setThreads(await res.json())
    }
  }, [])

  const loadMessages = useCallback(async (threadId: string) => {
    const res = await fetchWithAuth(`/threads/${threadId}/messages`)
    if (res.ok) {
      setMessages(await res.json())
    }
  }, [])

  const selectThread = useCallback(
    async (thread: Thread) => {
      setCurrentThread(thread)
      await loadMessages(thread.id)
    },
    [loadMessages],
  )

  const createThread = useCallback(
    async (title = "New Chat") => {
      const res = await fetchWithAuth("/threads", {
        method: "POST",
        body: JSON.stringify({ title }),
      })
      if (res.ok) {
        const thread: Thread = await res.json()
        setThreads((prev) => [thread, ...prev])
        setCurrentThread(thread)
        setMessages([])
        return thread
      }
      return null
    },
    [],
  )

  const deleteThread = useCallback(
    async (threadId: string) => {
      const res = await fetchWithAuth(`/threads/${threadId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setThreads((prev) => prev.filter((t) => t.id !== threadId))
        if (currentThread?.id === threadId) {
          setCurrentThread(null)
          setMessages([])
        }
      }
    },
    [currentThread],
  )

  const updateThreadTitle = useCallback(
    (threadId: string, title: string) => {
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, title } : t)),
      )
      setCurrentThread((prev) =>
        prev && prev.id === threadId ? { ...prev, title } : prev,
      )
    },
    [],
  )

  return {
    threads,
    currentThread,
    messages,
    setMessages,
    loadThreads,
    loadMessages,
    selectThread,
    createThread,
    deleteThread,
    updateThreadTitle,
  }
}
