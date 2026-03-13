export function StreamingMessage({ content }: { content: string }) {
  if (!content) return null

  return (
    <div className="flex w-full justify-start">
      <div className="max-w-[80%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap bg-muted text-muted-foreground">
        {content}
        <span className="inline-block w-1.5 h-4 ml-0.5 bg-foreground/50 animate-pulse" />
      </div>
    </div>
  )
}
