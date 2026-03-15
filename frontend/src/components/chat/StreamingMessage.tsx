import type { SourceCitation, SubAgentActivity } from "@/types"
import { MarkdownContent } from "./MarkdownContent"
import { SourceCitations } from "./SourceCitations"
import { SubAgentActivity as SubAgentActivityPanel } from "./SubAgentActivity"

interface StreamingMessageProps {
  content: string
  sources?: SourceCitation[]
  subAgentActivity?: SubAgentActivity | null
}

export function StreamingMessage({ content, sources, subAgentActivity }: StreamingMessageProps) {
  // Show the component if we have content OR an active sub-agent
  if (!content && !subAgentActivity) return null

  return (
    <div className="flex w-full justify-start">
      <div className="max-w-[80%]">
        {subAgentActivity && subAgentActivity.started && (
          <SubAgentActivityPanel activity={subAgentActivity} />
        )}
        {content && (
          <div className="px-4 py-2 text-sm text-foreground">
            <MarkdownContent content={content} />
            <span className="inline-block w-1.5 h-4 ml-0.5 bg-foreground/50 animate-pulse" />
          </div>
        )}
        {sources && sources.length > 0 && <SourceCitations sources={sources} />}
      </div>
    </div>
  )
}
