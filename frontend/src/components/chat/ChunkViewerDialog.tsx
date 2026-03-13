import { useEffect, useState } from "react"
import type { ChunkData } from "@/types"
import { fetchDocumentChunks } from "@/lib/api"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface ChunkViewerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId: string
  initialChunkIndex: number
  filename: string
}

export function ChunkViewerDialog({
  open,
  onOpenChange,
  documentId,
  initialChunkIndex,
  filename,
}: ChunkViewerDialogProps) {
  const [chunks, setChunks] = useState<ChunkData[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !documentId) return

    setLoading(true)
    setError(null)
    fetchDocumentChunks(documentId)
      .then((data) => {
        setChunks(data)
        const idx = data.findIndex((c) => c.chunk_index === initialChunkIndex)
        setCurrentIndex(idx >= 0 ? idx : 0)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, documentId, initialChunkIndex])

  const chunk = chunks[currentIndex]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium truncate pr-8">
            {filename}
          </DialogTitle>
          <DialogDescription>
            {chunks.length > 0
              ? `Chunk ${chunk?.chunk_index ?? 0} of ${chunks.length}`
              : "Loading chunks..."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <p className="text-sm text-muted-foreground p-4">Loading...</p>
          )}
          {error && (
            <p className="text-sm text-destructive p-4">{error}</p>
          )}
          {!loading && !error && chunk && (
            <pre className="text-sm whitespace-pre-wrap break-words font-sans leading-relaxed p-4 bg-muted/30 rounded-md">
              {chunk.content}
            </pre>
          )}
        </div>

        {chunks.length > 1 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => i - 1)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Prev
            </Button>
            <span className="text-xs text-muted-foreground">
              {currentIndex + 1} / {chunks.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentIndex === chunks.length - 1}
              onClick={() => setCurrentIndex((i) => i + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
