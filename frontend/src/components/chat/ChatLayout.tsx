import { useCallback, useEffect, useState } from "react"
import type { SourceCitation, SubAgentActivity, User } from "@/types"
import { useChat } from "@/hooks/useChat"
import { useSSE } from "@/hooks/useSSE"
import type { SSEEvent } from "@/hooks/useSSE"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { ThreadList } from "./ThreadList"
import { MessageList } from "./MessageList"
import { MessageInput } from "./MessageInput"

interface ChatLayoutProps {
  user: User
  onLogout: () => void
  onOpenSettings: () => void
  onOpenDocuments: () => void
}

export function ChatLayout({ user, onLogout, onOpenSettings, onOpenDocuments }: ChatLayoutProps) {
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
  const [streamingSources, setStreamingSources] = useState<SourceCitation[]>([])
  const [subAgentActivity, setSubAgentActivity] = useState<SubAgentActivity | null>(null)

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
        metadata: null,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, tempUserMsg])
      setStreamingContent("")
      setIsWaiting(true)
      setStreamingSources([])
      setSubAgentActivity(null)

      const handleSubAgentEvent = (event: SSEEvent) => {
        if (event.type === "sub_agent_start") {
          setIsWaiting(false)
          setSubAgentActivity({
            started: true,
            document: event.document || null,
            mode: event.mode || null,
            toolCalls: [],
            toolResults: [],
            completed: false,
          })
        } else if (event.type === "sub_agent_tool_call") {
          setSubAgentActivity((prev) =>
            prev
              ? {
                  ...prev,
                  toolCalls: [
                    ...prev.toolCalls,
                    { tool: event.tool || "", args: event.args || {} },
                  ],
                }
              : prev,
          )
        } else if (event.type === "sub_agent_tool_result") {
          setSubAgentActivity((prev) =>
            prev
              ? {
                  ...prev,
                  toolResults: [
                    ...prev.toolResults,
                    { tool: event.tool || "", summary: event.summary || "" },
                  ],
                }
              : prev,
          )
        } else if (event.type === "sub_agent_end") {
          setSubAgentActivity((prev) =>
            prev ? { ...prev, completed: true } : prev,
          )
        }
      }

      await streamMessage(
        thread.id,
        content,
        (delta) => {
          setIsWaiting(false)
          setStreamingContent((prev) => prev + delta)
        },
        async (_messageId, threadTitle, stopped) => {
          setIsWaiting(false)

          // Update thread title if generated
          if (threadTitle && thread) {
            updateThreadTitle(thread.id, threadTitle)
          }

          // Reload messages from server FIRST, then clear streaming state
          // so the UI transitions seamlessly from streaming to persisted data
          const res = await fetch(
            `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/threads/${thread.id}/messages`,
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("access_token")}`,
              },
            },
          )
          if (res.ok) {
            const newMessages = await res.json()
            // Batch all state updates together so React renders once
            setMessages(newMessages)
            setStreamingContent("")
            setStreamingSources([])
            setSubAgentActivity(null)
          } else {
            setStreamingContent("")
            setStreamingSources([])
            setSubAgentActivity(null)
          }
          loadThreads()
        },
        (sources) => {
          setStreamingSources(sources)
        },
        handleSubAgentEvent,
      )
    },
    [currentThread, createThread, user.id, setMessages, streamMessage, loadThreads, updateThreadTitle],
  )

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar user={user} onLogout={onLogout} onOpenSettings={onOpenSettings} onOpenDocuments={onOpenDocuments}>
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
              streamingSources={streamingSources}
              isWaiting={isWaiting}
              subAgentActivity={subAgentActivity}
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
          <>
            <div className="flex-1 flex flex-col items-center justify-center px-4">
              <div className="max-w-md text-center space-y-3">
                <h2 className="text-xl font-semibold text-foreground">What can I help you with?</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Ask questions about your documents, search your knowledge base, or start a conversation.
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <MessageInput
                onSend={handleSend}
                onStop={stop}
                disabled={streaming}
                streaming={streaming}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
