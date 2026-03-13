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
        {!isUser && metadata?.sub_agent && metadata.target_document && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Analyzed: {metadata.target_document}</span>
          </div>
        )}
      </div>
    </div>
  )
}
