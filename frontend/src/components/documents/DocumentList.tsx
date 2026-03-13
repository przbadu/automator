import type { Document } from "@/types"
import { DocumentStatusBadge } from "./DocumentStatusBadge"
import { Button } from "@/components/ui/button"

interface Props {
  documents: Document[]
  onDelete: (id: string) => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentList({ documents, onDelete }: Props) {
  if (documents.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No documents uploaded yet
      </div>
    )
  }

  return (
    <div className="divide-y">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center justify-between px-4 py-3 hover:bg-muted/50"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{doc.filename}</span>
              <DocumentStatusBadge status={doc.status} />
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted-foreground">
                {formatSize(doc.file_size)}
              </span>
              {doc.status === "completed" && (
                <span className="text-xs text-muted-foreground">
                  {doc.chunk_count} chunks
                </span>
              )}
              {doc.status === "failed" && doc.error_message && (
                <span className="text-xs text-red-500 truncate max-w-[200px]" title={doc.error_message}>
                  {doc.error_message}
                </span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive shrink-0 ml-2"
            onClick={() => onDelete(doc.id)}
          >
            ×
          </Button>
        </div>
      ))}
    </div>
  )
}
