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
} as const

export function DocumentUpload({ onUpload, uploading }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; variant: "success" | "info" | "warning" } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      setMessage(null)
      if (timerRef.current) clearTimeout(timerRef.current)
      try {
        const result = await onUpload(file)
        if (result.message) {
          setMessage({ text: result.message, variant: result.variant })
          timerRef.current = setTimeout(() => setMessage(null), 5000)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed")
      }
    },
    [onUpload],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      if (inputRef.current) inputRef.current.value = ""
    },
    [handleFile],
  )

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
          {uploading ? "Uploading..." : "Drag & drop a file here, or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground/60 mb-3">
          Supported: .txt, .md
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          Browse files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md"
          className="hidden"
          onChange={handleChange}
        />
      </div>
      {message && (
        <p data-testid="upload-message" className={`text-sm mt-2 px-3 py-2 rounded border ${variantStyles[message.variant]}`}>
          {message.text}
        </p>
      )}
      {error && (
        <p className="text-sm text-red-500 mt-2">{error}</p>
      )}
    </div>
  )
}
