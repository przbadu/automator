import type { ReactNode } from "react"
import type { User } from "@/types"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { FolderOpen, Moon, Sun } from "lucide-react"
import { useTheme } from "@/hooks/useTheme"

interface AppSidebarProps {
  user: User
  onLogout: () => void
  onOpenSettings: () => void
  onOpenDocuments?: () => void
  children: ReactNode
}

export function AppSidebar({ user, onLogout, onOpenSettings, onOpenDocuments, children }: AppSidebarProps) {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <div className="w-64 border-r flex flex-col shrink-0 h-full overflow-hidden bg-sidebar">
      <div className="flex-1 overflow-hidden min-h-0">
        {children}
      </div>
      <Separator />
      <div className="p-3 flex items-center gap-2 shrink-0 min-w-0">
        <button
          onClick={onLogout}
          className="flex-1 min-w-0 text-xs text-muted-foreground hover:text-foreground truncate text-left transition-colors"
          title={`Logout ${user.email}`}
        >
          Logout {user.email}
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
        >
          {resolvedTheme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </Button>
        {onOpenDocuments && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onOpenDocuments} title="Documents">
            <FolderOpen size={14} />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onOpenSettings} title="Settings">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </Button>
      </div>
    </div>
  )
}
