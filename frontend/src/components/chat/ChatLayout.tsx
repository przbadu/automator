import { useCallback, useEffect, useState } from "react"
import type { User } from "@/types"
import { useChat } from "@/hooks/useChat"
import { useSSE } from "@/hooks/useSSE"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { ThreadList } from "./ThreadList"
import { MessageList } from "./MessageList"
import { MessageInput } from "./MessageInput"

interface ChatLayoutProps {
  user: User
  onLogout: () => void
  onOpenSettings: () => void
}

export function ChatLayout({ user, onLogout, onOpenSettings }: ChatLayoutProps) {
  const {
    threads,
    currentThread,
    messages,
    setMessages,
    loadThreads,
    selectThread,
    createThread,
    deleteThread,
    updateThreadTitle,
  } = useChat()

  const { streaming, streamMessage, stop } = useSSE()
  const [streamingContent, setStreamingContent] = useState("")
  const [isWaiting, setIsWaiting] = useState(false)

  useEffect(() => {
    loadThreads()
  }, [loadThreads])

  const handleSend = useCallback(
    async (content: string) => {
      let thread = currentThread
      if (!thread) {
        thread = await createThread(content.slice(0, 50))
        if (!thread) return
      }

      // Optimistic: add user message to UI
      const tempUserMsg = {
        id: `temp-${Date.now()}`,
        thread_id: thread.id,
        user_id: user.id,
        role: "user" as const,
        content,
        metadata: "{}",
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, tempUserMsg])
      setStreamingContent("")
      setIsWaiting(true)

      await streamMessage(
        thread.id,
        content,
        (delta) => {
          setIsWaiting(false)
          setStreamingContent((prev) => prev + delta)
        },
        async (_messageId, threadTitle, stopped) => {
          setStreamingContent("")
          setIsWaiting(false)

          // Update thread title if generated
          if (threadTitle && thread) {
            updateThreadTitle(thread.id, threadTitle)
          }

          // Reload messages from server to get saved content (including partial)
          const res = await fetch(
            `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/threads/${thread.id}/messages`,
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("access_token")}`,
              },
            },
          )
          if (res.ok) {
            setMessages(await res.json())
          }
          loadThreads()
        },
      )
    },
    [currentThread, createThread, user.id, setMessages, streamMessage, loadThreads, updateThreadTitle],
  )

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar user={user} onLogout={onLogout} onOpenSettings={onOpenSettings}>
        <ThreadList
          threads={threads}
          currentThreadId={currentThread?.id ?? null}
          onSelect={selectThread}
          onCreate={() => createThread()}
          onDelete={deleteThread}
        />
      </AppSidebar>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {currentThread ? (
          <>
            {/* Header - fixed */}
            <div className="px-4 py-3 border-b shrink-0 bg-background">
              <h2 className="font-semibold text-sm truncate">
                {currentThread.title}
              </h2>
            </div>

            {/* Messages - scrollable */}
            <MessageList
              messages={messages}
              streamingContent={streamingContent}
              isWaiting={isWaiting}
            />

            {/* Input - fixed at bottom */}
            <div className="shrink-0">
              <MessageInput
                onSend={handleSend}
                onStop={stop}
                disabled={streaming}
                streaming={streaming}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Select or create a chat to get started
          </div>
        )}
      </div>
    </div>
  )
}
