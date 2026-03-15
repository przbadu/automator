import { useState } from "react"
import type { FolderTreeNode } from "@/types"
import { FolderContextMenu } from "./FolderContextMenu"
import { ChevronRight, Folder, FolderOpen } from "lucide-react"

interface Props {
  node: FolderTreeNode
  level: number
  selectedFolderId: string | null
  onSelect: (id: string) => void
  onCreateFolder: (parentId: string) => void
  onRenameFolder: (id: string, currentName: string) => void
  onDeleteFolder: (id: string, name: string) => void
}

export function FolderTreeItem({
  node,
  level,
  selectedFolderId,
  onSelect,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const hasChildren = node.children.length > 0
  const isSelected = selectedFolderId === node.id

  return (
    <div>
      <FolderContextMenu
        onCreateSubfolder={() => onCreateFolder(node.id)}
        onRename={() => onRenameFolder(node.id, node.name)}
        onDelete={() => onDeleteFolder(node.id, node.name)}
      >
        <button
          onClick={() => onSelect(node.id)}
          className={`
            group flex w-full items-center gap-1.5 py-1.5 px-2 text-sm font-medium
            transition-colors duration-150 rounded-md
            ${isSelected
              ? "bg-accent border-l-2 border-primary"
              : "hover:bg-accent/50 border-l-2 border-transparent"
            }
          `}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {/* Chevron for expand/collapse */}
          <span
            onClick={(e) => {
              e.stopPropagation()
              if (hasChildren) setExpanded(!expanded)
            }}
            className={`
              flex items-center justify-center size-4 shrink-0
              transition-transform duration-200 ease-in-out
              ${hasChildren ? "cursor-pointer" : "invisible"}
              ${expanded ? "rotate-90" : ""}
            `}
          >
            <ChevronRight className="size-3.5 text-muted-foreground" />
          </span>

          {/* Folder icon */}
          {expanded && hasChildren ? (
            <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="size-4 shrink-0 text-muted-foreground" />
          )}

          {/* Folder name */}
          <span className="truncate flex-1 text-left">{node.name}</span>

          {/* Document count badge */}
          {node.document_count > 0 && (
            <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
              {node.document_count}
            </span>
          )}
        </button>
      </FolderContextMenu>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              node={child}
              level={level + 1}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              onCreateFolder={onCreateFolder}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
            />
          ))}
        </div>
      )}
    </div>
  )
}
