import type { ReactNode } from "react"
import type { User } from "@/types"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronUp, FolderOpen, LogOut, Moon, Settings, Sun } from "lucide-react"
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
      <div className="p-2 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 w-full rounded-md px-2 py-2 text-sm hover:bg-accent transition-colors min-w-0">
              <div className="size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-semibold uppercase">
                {user.email.charAt(0)}
              </div>
              <span className="flex-1 min-w-0 text-left text-sm truncate text-foreground">
                {user.email}
              </span>
              <ChevronUp className="size-4 text-muted-foreground shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuItem onClick={onOpenSettings}>
              <Settings className="size-4" />
              Settings
            </DropdownMenuItem>
            {onOpenDocuments && (
              <DropdownMenuItem onClick={onOpenDocuments}>
                <FolderOpen className="size-4" />
                Documents
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout}>
              <LogOut className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
