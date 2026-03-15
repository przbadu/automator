import type { Thread } from "@/types"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

interface ThreadListProps {
  threads: Thread[]
  currentThreadId: string | null
  onSelect: (thread: Thread) => void
  onCreate: () => void
  onDelete: (threadId: string) => void
}

export function ThreadList({
  threads,
  currentThreadId,
  onSelect,
  onCreate,
  onDelete,
}: ThreadListProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3">
        <Button onClick={onCreate} className="w-full" variant="outline">
          + New Chat
        </Button>
      </div>
      <Separator />
      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-2 space-y-1">
          {threads.map((thread) => (
            <div
              key={thread.id}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-accent group",
                thread.id === currentThreadId && "bg-accent",
              )}
              onClick={() => onSelect(thread)}
            >
              <span className="truncate flex-1">{thread.title}</span>
              <button
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive ml-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(thread.id)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
