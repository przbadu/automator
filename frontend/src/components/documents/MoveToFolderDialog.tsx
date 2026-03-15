import { useState } from "react"
import type { FolderTreeNode } from "@/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ChevronRight, Files, Folder, FolderOpen } from "lucide-react"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tree: FolderTreeNode[]
  currentFolderId: string | null
  onMove: (targetFolderId: string | null) => Promise<void>
  itemName: string
}

interface FolderOptionProps {
  node: FolderTreeNode
  level: number
  currentFolderId: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function FolderOption({
  node,
  level,
  currentFolderId,
  selectedId,
  onSelect,
}: FolderOptionProps) {
  const [expanded, setExpanded] = useState(true)
  const isCurrent = node.id === currentFolderId
  const isSelected = node.id === selectedId
  const hasChildren = node.children.length > 0

  return (
    <div>
      <button
        onClick={() => !isCurrent && onSelect(node.id)}
        disabled={isCurrent}
        className={`
          group flex w-full items-center gap-1.5 py-1.5 px-2 text-sm
          transition-colors duration-150 rounded-md
          ${isCurrent
            ? "opacity-50 cursor-not-allowed"
            : isSelected
              ? "bg-accent border-l-2 border-primary font-medium"
              : "hover:bg-accent/50 border-l-2 border-transparent"
          }
        `}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {/* Chevron */}
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

        {/* Name */}
        <span className="truncate flex-1 text-left">{node.name}</span>

        {/* Current indicator */}
        {isCurrent && (
          <span className="text-[10px] text-muted-foreground shrink-0">current</span>
        )}
      </button>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <FolderOption
              key={child.id}
              node={child}
              level={level + 1}
              currentFolderId={currentFolderId}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function MoveToFolderDialog({
  open,
  onOpenChange,
  tree,
  currentFolderId,
  onMove,
  itemName,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)

  const isRootCurrent = currentFolderId === null
  const isRootSelected = selectedId === null && !isRootCurrent

  const handleMove = async () => {
    setMoving(true)
    try {
      await onMove(selectedId)
      onOpenChange(false)
    } finally {
      setMoving(false)
    }
  }

  // Determine if user has made a valid selection different from current
  const hasValidSelection =
    selectedId !== currentFolderId && !(selectedId === null && currentFolderId === null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move "{itemName}"</DialogTitle>
        </DialogHeader>

        <div className="max-h-[300px] overflow-y-auto -mx-4 px-4">
          {/* Unfiled (root) option */}
          <button
            onClick={() => !isRootCurrent && setSelectedId(null)}
            disabled={isRootCurrent}
            className={`
              flex w-full items-center gap-2 py-1.5 px-2 text-sm
              transition-colors duration-150 rounded-md
              ${isRootCurrent
                ? "opacity-50 cursor-not-allowed"
                : isRootSelected
                  ? "bg-accent border-l-2 border-primary font-medium"
                  : "hover:bg-accent/50 border-l-2 border-transparent"
              }
            `}
          >
            <Files className="size-4 text-muted-foreground" />
            <span>Unfiled (root)</span>
            {isRootCurrent && (
              <span className="text-[10px] text-muted-foreground ml-auto">current</span>
            )}
          </button>

          {/* Folder tree */}
          <div className="mt-1">
            {tree.map((node) => (
              <FolderOption
                key={node.id}
                node={node}
                level={0}
                currentFolderId={currentFolderId}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={moving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={!hasValidSelection || moving}
          >
            {moving ? "Moving..." : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
