import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { UploadResult } from "@/types"

interface Props {
  onUpload: (file: File) => Promise<UploadResult>
  uploading: boolean
}

const variantStyles = {
  success: "text-green-600 bg-green-50 border-green-200",
  info: "text-blue-600 bg-blue-50 border-blue-200",
  warning: "text-yellow-700 bg-yellow-50 border-yellow-200",
  error: "text-red-600 bg-red-50 border-red-200",
} as const

interface UploadMessage {
  text: string
  variant: "success" | "info" | "warning" | "error"
}

export function DocumentUpload({ onUpload, uploading }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [messages, setMessages] = useState<UploadMessage[]>([])
  const [uploadingCount, setUploadingCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      setMessages([])
      if (timerRef.current) clearTimeout(timerRef.current)
      setUploadingCount(files.length)

      const results: UploadMessage[] = []

      // Upload files concurrently
      await Promise.allSettled(
        files.map(async (file) => {
          try {
            const result = await onUpload(file)
            if (result.message) {
              results.push({ text: `${file.name}: ${result.message}`, variant: result.variant })
            }
          } catch (e) {
            results.push({
              text: `${file.name}: ${e instanceof Error ? e.message : "Upload failed"}`,
              variant: "error",
            })
          }
        }),
      )

      setUploadingCount(0)
      if (results.length > 0) {
        setMessages(results)
        timerRef.current = setTimeout(() => setMessages([]), 5000)
      }
    },
    [onUpload],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) handleFiles(files)
    },
    [handleFiles],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length > 0) handleFiles(files)
      if (inputRef.current) inputRef.current.value = ""
    },
    [handleFiles],
  )

  const isUploading = uploading || uploadingCount > 0

  return (
    <div className="p-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        }`}
      >
        <p className="text-sm text-muted-foreground mb-2">
          {isUploading
            ? `Uploading${uploadingCount > 1 ? ` ${uploadingCount} files` : ""}...`
            : "Drag & drop files here, or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground/60 mb-3">
          Supported: .txt, .md, .pdf, .docx, .pptx, .html, .xlsx, .csv
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
        >
          Browse files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md,.pdf,.docx,.pptx,.html,.htm,.xlsx,.csv"
          multiple
          className="hidden"
          onChange={handleChange}
        />
      </div>
      {messages.length > 0 && (
        <div className="mt-2 space-y-1">
          {messages.map((msg, i) => (
            <p
              key={i}
              data-testid="upload-message"
              className={`text-sm px-3 py-2 rounded border ${variantStyles[msg.variant]}`}
            >
              {msg.text}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
