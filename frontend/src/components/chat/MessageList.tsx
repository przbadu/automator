import { useEffect, useRef } from "react"
import type { Message, SourceCitation } from "@/types"
import { MessageBubble } from "./MessageBubble"
import { StreamingMessage } from "./StreamingMessage"
import { ThinkingIndicator } from "./ThinkingIndicator"

interface MessageListProps {
  messages: Message[]
  streamingContent: string
  streamingSources?: SourceCitation[]
  isWaiting?: boolean
}

export function MessageList({ messages, streamingContent, streamingSources, isWaiting }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent, isWaiting])

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
      <div className="space-y-4 max-w-3xl mx-auto">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} metadata={msg.metadata} />
        ))}
        {isWaiting && <ThinkingIndicator />}
        {streamingContent && <StreamingMessage content={streamingContent} sources={streamingSources} />}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
