import { useState } from "react"
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

function MetadataDisplay({ metadata }: { metadata: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false)

  const docType = metadata.document_type as string | undefined
  const topics = metadata.topics as string[] | undefined
  const summary = metadata.summary as string | undefined
  const keyEntities = metadata.key_entities as string[] | undefined
  const language = metadata.language as string | undefined

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {docType && (
          <span className="inline-flex items-center rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[10px] font-medium">
            {docType}
          </span>
        )}
        {language && (
          <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[10px] font-medium uppercase">
            {language}
          </span>
        )}
        {topics && topics.length > 0 &&
          topics.slice(0, 3).map((topic) => (
            <span
              key={topic}
              className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 px-1.5 py-0.5 text-[10px]"
            >
              {topic}
            </span>
          ))}
        {topics && topics.length > 3 && (
          <span className="text-[10px] text-muted-foreground">
            +{topics.length - 3} more
          </span>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-muted-foreground hover:text-foreground ml-1"
        >
          {expanded ? "less" : "more"}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-1.5 text-xs text-muted-foreground border-l-2 border-muted pl-3">
          {summary && <p>{summary}</p>}
          {keyEntities && keyEntities.length > 0 && (
            <p>
              <span className="font-medium text-foreground">Entities: </span>
              {keyEntities.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  )
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
          className="flex items-start justify-between px-4 py-3 hover:bg-muted/50"
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
            {doc.metadata && doc.status === "completed" && (
              <MetadataDisplay metadata={doc.metadata} />
            )}
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
