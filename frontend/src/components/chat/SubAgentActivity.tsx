import { useState, useEffect } from "react"
import type { SubAgentActivity as SubAgentActivityType } from "@/types"
import { cn } from "@/lib/utils"

interface SubAgentActivityProps {
  activity: SubAgentActivityType
}

export function SubAgentActivity({ activity }: SubAgentActivityProps) {
  const [open, setOpen] = useState(true)

  // Auto-collapse when completed
  useEffect(() => {
    if (activity.completed) {
      const timer = setTimeout(() => setOpen(false), 1000)
      return () => clearTimeout(timer)
    }
  }, [activity.completed])

  const isWorking = activity.started && !activity.completed &&
    activity.toolCalls.length > activity.toolResults.length

  return (
    <div className="mt-1.5 mb-1.5 rounded-md border border-border/50 bg-background/50 text-xs">
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
        <span className="flex items-center gap-1.5">
          {activity.completed ? (
            <span className="text-green-600 dark:text-green-400">Analyzed</span>
          ) : (
            <span className="text-blue-600 dark:text-blue-400">Analyzing</span>
          )}
          {activity.document && (
            <span className="font-medium text-foreground">{activity.document}</span>
          )}
          {!activity.completed && (
            <span className="inline-flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1 h-1 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1 h-1 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          )}
        </span>
      </button>

      {open && activity.toolCalls.length > 0 && (
        <div className="border-t border-border/50 px-3 py-2 space-y-1.5">
          {activity.toolCalls.map((call, i) => {
            const result = activity.toolResults[i]
            return (
              <div key={`tool-${i}`} className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-blue-600 dark:text-blue-400 shrink-0">
                    {i + 1}.
                  </span>
                  <span className="font-medium text-foreground">
                    {call.tool.replace(/_/g, " ")}
                  </span>
                  {call.args && Object.keys(call.args).length > 0 && (
                    <span className="text-muted-foreground truncate">
                      ({Object.entries(call.args)
                        .filter(([k]) => k !== "document_id")
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(", ")})
                    </span>
                  )}
                </div>
                {result ? (
                  <p className="text-muted-foreground line-clamp-2 leading-relaxed pl-5">
                    {result.summary}
                  </p>
                ) : isWorking && i === activity.toolCalls.length - 1 ? (
                  <p className="text-muted-foreground pl-5 italic">
                    Working...
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
