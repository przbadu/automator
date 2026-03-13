import type { Document } from "@/types"

const STATUS_CONFIG: Record<
  Document["status"],
  { label: string; className: string }
> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-800 animate-pulse" },
  converting: { label: "Converting", className: "bg-orange-100 text-orange-800 animate-pulse" },
  chunking: { label: "Chunking", className: "bg-blue-100 text-blue-800 animate-pulse" },
  extracting_metadata: { label: "Extracting Metadata", className: "bg-purple-100 text-purple-800 animate-pulse" },
  embedding: { label: "Embedding", className: "bg-blue-100 text-blue-800 animate-pulse" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800" },
}

interface Props {
  status: Document["status"]
}

export function DocumentStatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  )
}
