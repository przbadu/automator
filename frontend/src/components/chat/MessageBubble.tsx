import { cn } from "@/lib/utils"
import type { MessageMetadata } from "@/types"
import { MarkdownContent } from "./MarkdownContent"
import { SourceCitations } from "./SourceCitations"
import { SubAgentActivity } from "./SubAgentActivity"

interface MessageBubbleProps {
  role: "user" | "assistant"
  content: string
  metadata?: MessageMetadata | null
}

export function MessageBubble({ role, content, metadata }: MessageBubbleProps) {
  const isUser = role === "user"
  const sources = (!isUser && metadata?.sources) || []
  const hasSubAgent = !isUser && metadata?.sub_agent

  // Build a SubAgentActivity object from persisted metadata
  const persistedActivity = hasSubAgent
    ? {
        started: true,
        document: metadata?.target_document || null,
        mode: (metadata?.target_document ? "document_analysis" : "tools") as "document_analysis" | "tools",
        toolCalls: (metadata?.tool_calls || []).map((tc) => ({
          tool: tc.tool,
          args: tc.args,
        })),
        toolResults: (metadata?.tool_results || []).map((tr) => ({
          tool: tr.tool,
          summary: tr.summary,
        })),
        completed: true,
      }
    : null

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[92%] md:max-w-[80%]", isUser ? "" : "")}>
        {persistedActivity && persistedActivity.toolCalls.length > 0 && (
          <SubAgentActivity activity={persistedActivity} defaultCollapsed />
        )}
        <div
          className={cn(
            "text-sm",
            isUser
              ? "rounded-lg px-4 py-2 bg-primary text-primary-foreground whitespace-pre-wrap"
              : "px-4 py-2 text-foreground",
          )}
        >
          {isUser ? content : <MarkdownContent content={content} />}
        </div>
        {sources.length > 0 && <SourceCitations sources={sources} />}
        {hasSubAgent && (metadata?.target_document || persistedActivity?.mode === "tools") && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{metadata?.target_document ? `Analyzed: ${metadata.target_document}` : "Used tools"}</span>
          </div>
        )}
      </div>
    </div>
  )
}
