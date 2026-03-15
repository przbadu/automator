import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { FolderInput, FolderPlus, Pencil, Trash2 } from "lucide-react"

interface Props {
  children: React.ReactNode
  onCreateSubfolder: () => void
  onRename: () => void
  onDelete: () => void
  onMoveFolder?: () => void
}

export function FolderContextMenu({
  children,
  onCreateSubfolder,
  onRename,
  onDelete,
  onMoveFolder,
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
        {onMoveFolder && (
          <ContextMenuItem onClick={onMoveFolder}>
            <FolderInput className="size-4" />
            Move to...
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="size-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
