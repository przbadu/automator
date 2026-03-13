import { useState } from "react"
import type { SourceCitation } from "@/types"
import { cn } from "@/lib/utils"

interface SourceCitationsProps {
  sources: SourceCitation[]
}

function relevanceColor(score: number): string {
  if (score >= 0.9) return "text-green-600 dark:text-green-400"
  if (score >= 0.75) return "text-yellow-600 dark:text-yellow-400"
  return "text-muted-foreground"
}

export function SourceCitations({ sources }: SourceCitationsProps) {
  const [open, setOpen] = useState(false)

  if (!sources.length) return null

  return (
    <div className="mt-1.5 rounded-md border border-border/50 bg-background/50 text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg
          className={cn("h-3 w-3 transition-transform", open && "rotate-90")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span>Sources ({sources.length})</span>
      </button>

      {open && (
        <div className="border-t border-border/50 px-3 py-2 space-y-2">
          {sources.map((source, i) => (
            <div key={`${source.filename}-${source.chunk_index}-${i}`} className="space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground truncate">
                  {source.filename}
                  <span className="text-muted-foreground font-normal"> (chunk {source.chunk_index})</span>
                </span>
                <span className={cn("shrink-0 font-mono", relevanceColor(source.relevance_score))}>
                  {(source.relevance_score * 100).toFixed(1)}%
                </span>
              </div>
              {source.preview && (
                <p className="text-muted-foreground line-clamp-2 leading-relaxed">
                  {source.preview}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
