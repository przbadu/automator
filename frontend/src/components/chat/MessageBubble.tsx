import { cn } from "@/lib/utils"
import type { MessageMetadata } from "@/types"
import { SourceCitations } from "./SourceCitations"

interface MessageBubbleProps {
  role: "user" | "assistant"
  content: string
  metadata?: MessageMetadata | null
}

export function MessageBubble({ role, content, metadata }: MessageBubbleProps) {
  const isUser = role === "user"
  const sources = (!isUser && metadata?.sources) || []

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[80%]", isUser ? "" : "")}>
        <div
          className={cn(
            "rounded-lg px-4 py-2 text-sm whitespace-pre-wrap",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {content}
        </div>
        {sources.length > 0 && <SourceCitations sources={sources} />}
      </div>
    </div>
  )
}
