import { type FormEvent, type KeyboardEvent, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

interface MessageInputProps {
  onSend: (content: string) => void
  onStop?: () => void
  disabled?: boolean
  streaming?: boolean
}

export function MessageInput({ onSend, onStop, disabled, streaming }: MessageInputProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t bg-background p-4">
      <div className="flex gap-2 max-w-3xl mx-auto">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            e.target.style.height = "auto"
            e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-input bg-background px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 transition-shadow max-h-[200px]"
        />
        {streaming ? (
          <Button
            type="button"
            variant="destructive"
            onClick={onStop}
            className="self-end h-11 px-5"
          >
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 bg-current rounded-sm" />
              Stop
            </span>
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={disabled || !value.trim()}
            className="self-end h-11 px-5"
          >
            Send
          </Button>
        )}
      </div>
    </form>
  )
}
