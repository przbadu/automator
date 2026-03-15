import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { FolderPlus, Pencil, Trash2 } from "lucide-react"

interface Props {
  children: React.ReactNode
  onCreateSubfolder: () => void
  onRename: () => void
  onDelete: () => void
}

export function FolderContextMenu({
  children,
  onCreateSubfolder,
  onRename,
  onDelete,
}: Props) {
  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onCreateSubfolder}>
          <FolderPlus className="size-4" />
          New Subfolder
        </ContextMenuItem>
        <ContextMenuItem onClick={onRename}>
          <Pencil className="size-4" />
          Rename
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="size-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
