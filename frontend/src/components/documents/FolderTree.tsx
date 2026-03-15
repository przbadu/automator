import type { FolderTreeNode } from "@/types"
import { FolderTreeItem } from "./FolderTreeItem"
import { Files, FolderPlus } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  tree: FolderTreeNode[]
  selectedFolderId: string | null
  onSelect: (id: string | null) => void
  onCreateFolder: (parentId: string | null) => void
  onRenameFolder: (id: string, currentName: string) => void
  onDeleteFolder: (id: string, name: string) => void
  onMoveFolder: (id: string, name: string) => void
}

export function FolderTree({
  tree,
  selectedFolderId,
  onSelect,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
}: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* Section header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          Folders
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onCreateFolder(null)}
          title="Create folder"
          className="size-6"
        >
          <FolderPlus className="size-3.5" />
        </Button>
      </div>

      {/* All Documents button */}
      <button
        onClick={() => onSelect(null)}
        className={`
          flex items-center gap-2 mx-2 py-1.5 px-2 text-sm font-medium
          rounded-md transition-colors duration-150
          ${selectedFolderId === null
            ? "bg-accent border-l-2 border-primary"
            : "hover:bg-accent/50 border-l-2 border-transparent"
          }
        `}
      >
        <Files className="size-4 text-muted-foreground" />
        <span>All Documents</span>
      </button>

      {/* Tree items */}
      <div className="flex-1 overflow-y-auto px-2 mt-1">
        {tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4">
            <div className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-6 flex flex-col items-center gap-2">
              <FolderPlus className="size-8 text-muted-foreground/40" />
              <span className="text-xs text-muted-foreground/60 text-center">
                Create your first folder
              </span>
            </div>
          </div>
        ) : (
          tree.map((node) => (
            <FolderTreeItem
              key={node.id}
              node={node}
              level={0}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              onCreateFolder={onCreateFolder}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onMoveFolder={onMoveFolder}
            />
          ))
        )}
      </div>
    </div>
  )
}
