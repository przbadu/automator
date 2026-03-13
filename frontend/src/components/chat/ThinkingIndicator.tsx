export function ThinkingIndicator() {
  return (
    <div className="flex w-full justify-start">
      <div className="max-w-[80%] rounded-lg px-4 py-3 bg-muted text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">Thinking</span>
          <span className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
          </span>
        </div>
      </div>
    </div>
  )
}
