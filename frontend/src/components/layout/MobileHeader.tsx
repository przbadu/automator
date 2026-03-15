import { Menu } from "lucide-react"

interface MobileHeaderProps {
  onToggleSidebar: () => void
  title?: string
  children?: React.ReactNode
}

export function MobileHeader({ onToggleSidebar, title, children }: MobileHeaderProps) {
  return (
    <div className="md:hidden flex items-center gap-2 px-3 py-2.5 border-b bg-background shrink-0">
      <button
        onClick={onToggleSidebar}
        className="size-9 flex items-center justify-center rounded-md hover:bg-accent transition-colors shrink-0"
        aria-label="Toggle sidebar"
      >
        <Menu className="size-5" />
      </button>
      {title && (
        <span className="text-sm font-semibold truncate">{title}</span>
      )}
      {children}
    </div>
  )
}
