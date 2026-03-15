import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface Props {
  content: string
}

export function MarkdownContent({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-lg font-bold mt-4 mb-2 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-1.5 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-bold mt-3 mb-1 first:mt-0">{children}</h3>,
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ className, children }) => {
          const isBlock = className?.includes("language-")
          if (isBlock) {
            return (
              <code className="block bg-background/50 rounded px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre">
                {children}
              </code>
            )
          }
          return (
            <code className="bg-background/50 rounded px-1 py-0.5 text-xs font-mono">
              {children}
            </code>
          )
        },
        pre: ({ children }) => <pre className="mb-2 last:mb-0">{children}</pre>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-foreground/20 pl-3 italic mb-2 last:mb-0">
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2 last:mb-0">
            <table className="min-w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border border-foreground/20 px-2 py-1 text-left font-semibold bg-background/30">{children}</th>,
        td: ({ children }) => <td className="border border-foreground/20 px-2 py-1">{children}</td>,
        hr: () => <hr className="border-foreground/10 my-3" />,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
