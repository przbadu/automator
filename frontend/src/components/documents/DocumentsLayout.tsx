import { useEffect, useMemo, useState } from "react"
import { useDocuments } from "@/hooks/useDocuments"
import { useFolders } from "@/hooks/useFolders"
import { useSidebar } from "@/hooks/useSidebar"
import type { FolderTreeNode } from "@/types"
import { DocumentUpload } from "./DocumentUpload"
import { DocumentList } from "./DocumentList"
import { FolderTree } from "./FolderTree"
import { CreateFolderDialog } from "./CreateFolderDialog"
import { DeleteFolderDialog } from "./DeleteFolderDialog"
import { MoveToFolderDialog } from "./MoveToFolderDialog"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { MobileHeader } from "@/components/layout/MobileHeader"
import { ArrowUpDown, ChevronRight, Folder as FolderIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  onLogout: () => void
  userEmail: string
  onNavigateToChat: () => void
  onOpenSettings: () => void
}

type DialogState =
  | { type: "closed" }
  | { type: "create"; parentId: string | null }
  | { type: "rename"; folderId: string; currentName: string }
  | { type: "delete"; folderId: string; folderName: string }

type MoveDialogState = {
  open: boolean
  itemType: "document" | "folder"
  itemId: string
  itemName: string
  currentFolderId: string | null
} | null

function findFolderName(
  tree: { id: string; name: string; children: { id: string; name: string; children: unknown[] }[] }[],
  id: string,
): string | null {
  for (const node of tree) {
    if (node.id === id) return node.name
    const found = findFolderName(
      node.children as typeof tree,
      id,
    )
    if (found) return found
  }
  return null
}

function findFolderNode(
  tree: FolderTreeNode[],
  id: string,
): FolderTreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node
    const found = findFolderNode(node.children, id)
    if (found) return found
  }
  return null
}

function buildBreadcrumb(
  tree: FolderTreeNode[],
  id: string,
  path: { id: string; name: string }[] = [],
): { id: string; name: string }[] | null {
  for (const node of tree) {
    if (node.id === id) return [...path, { id: node.id, name: node.name }]
    const found = buildBreadcrumb(node.children, id, [...path, { id: node.id, name: node.name }])
    if (found) return found
  }
  return null
}

function findFolderParentId(
  tree: { id: string; name: string; children: { id: string; name: string; children: unknown[] }[] }[],
  id: string,
  parentId: string | null = null,
): string | null | undefined {
  for (const node of tree) {
    if (node.id === id) return parentId
    const found = findFolderParentId(
      node.children as typeof tree,
      id,
      node.id,
    )
    if (found !== undefined) return found
  }
  return undefined
}

export function DocumentsLayout({ onLogout, userEmail, onNavigateToChat, onOpenSettings }: Props) {
  const { documents, uploading, loadDocuments, uploadDocument, deleteDocument, moveDocument } =
    useDocuments()
  const {
    tree,
    selectedFolderId,
    setSelectedFolderId,
    loadTree,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
  } = useFolders()

  const [dialogState, setDialogState] = useState<DialogState>({ type: "closed" })
  const [moveDialogState, setMoveDialogState] = useState<MoveDialogState>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const sidebar = useSidebar()

  useEffect(() => {
    loadDocuments()
    loadTree()
  }, [loadDocuments, loadTree])

  // Direct children documents only (like Finder — shows only current folder's files)
  const filteredDocuments = useMemo(() => {
    const docs = selectedFolderId === null
      ? documents.filter((doc) => doc.folder_id === null || doc.folder_id === undefined)
      : documents.filter((doc) => doc.folder_id === selectedFolderId)
    return [...docs].sort((a, b) => {
      const cmp = a.filename.localeCompare(b.filename, undefined, { sensitivity: "base" })
      return sortAsc ? cmp : -cmp
    })
  }, [documents, selectedFolderId, sortAsc])

  // Direct child folders of the current folder
  const childFolders = useMemo(() => {
    const children = selectedFolderId === null
      ? tree
      : (findFolderNode(tree, selectedFolderId)?.children ?? [])
    return [...children].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      return sortAsc ? cmp : -cmp
    })
  }, [tree, selectedFolderId, sortAsc])

  // Breadcrumb path
  const breadcrumb = useMemo(() => {
    if (selectedFolderId === null) return []
    return buildBreadcrumb(tree, selectedFolderId) ?? []
  }, [tree, selectedFolderId])

  // Resolve selected folder name for header
  const selectedFolderName = useMemo(() => {
    if (selectedFolderId === null) return null
    return findFolderName(tree, selectedFolderId)
  }, [tree, selectedFolderId])

  // Dialog handlers
  const handleCreateFolder = (parentId: string | null) => {
    setDialogState({ type: "create", parentId })
  }

  const handleRenameFolder = (id: string, currentName: string) => {
    setDialogState({ type: "rename", folderId: id, currentName })
  }

  const handleDeleteFolder = (id: string, name: string) => {
    setDialogState({ type: "delete", folderId: id, folderName: name })
  }

  const handleMoveDocument = (docId: string, docName: string) => {
    const doc = documents.find((d) => d.id === docId)
    setMoveDialogState({
      open: true,
      itemType: "document",
      itemId: docId,
      itemName: docName,
      currentFolderId: doc?.folder_id ?? null,
    })
  }

  const handleMoveFolder = (folderId: string, folderName: string) => {
    const parentId = findFolderParentId(tree, folderId)
    setMoveDialogState({
      open: true,
      itemType: "folder",
      itemId: folderId,
      itemName: folderName,
      currentFolderId: parentId ?? null,
    })
  }

  const handleMoveConfirm = async (targetFolderId: string | null) => {
    if (!moveDialogState) return
    if (moveDialogState.itemType === "document") {
      await moveDocument(moveDialogState.itemId, targetFolderId)
      await loadTree()
    } else {
      await moveFolder(moveDialogState.itemId, targetFolderId)
    }
    await loadDocuments()
  }

  const handleUpload = async (file: File) => {
    const result = await uploadDocument(file, selectedFolderId)
    await loadTree()
    return result
  }

  const handleSelectFolder = (folderId: string | null) => {
    setSelectedFolderId(folderId)
    sidebar.close()
  }

  const closeDialog = () => setDialogState({ type: "closed" })

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <AppSidebar
        user={{ id: "", email: userEmail, created_at: "" }}
        onLogout={onLogout}
        onOpenSettings={onOpenSettings}
        open={sidebar.open}
        isMobile={sidebar.isMobile}
        onClose={sidebar.close}
      >
        <div className="flex flex-col h-full">
          <div className="p-3">
            <button
              onClick={() => { sidebar.close(); onNavigateToChat() }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back to Chat
            </button>
            <h2 className="text-sm font-semibold mt-2">Documents</h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <FolderTree
              tree={tree}
              selectedFolderId={selectedFolderId}
              onSelect={handleSelectFolder}
              onCreateFolder={handleCreateFolder}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onMoveFolder={handleMoveFolder}
            />
          </div>
        </div>
      </AppSidebar>

      {/* Main content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Mobile header */}
        <MobileHeader
          onToggleSidebar={sidebar.toggle}
          title={selectedFolderName ?? "Documents"}
        />

        {/* Header with breadcrumb and sort */}
        <div className="px-3 md:px-4 py-2.5 md:py-3 border-b shrink-0 bg-background flex items-center justify-between gap-2">
          <nav className="flex items-center gap-1 text-sm min-w-0 overflow-x-auto">
            <button
              onClick={() => setSelectedFolderId(null)}
              className={`shrink-0 font-semibold transition-colors ${
                selectedFolderId === null
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Documents
            </button>
            {breadcrumb.map((crumb) => (
              <span key={crumb.id} className="flex items-center gap-1 min-w-0">
                <ChevronRight className="size-3 text-muted-foreground shrink-0" />
                <button
                  onClick={() => setSelectedFolderId(crumb.id)}
                  className={`truncate transition-colors ${
                    crumb.id === selectedFolderId
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-xs text-muted-foreground gap-1"
            onClick={() => setSortAsc((prev) => !prev)}
            title={sortAsc ? "Sorted A-Z (click to reverse)" : "Sorted Z-A (click to reverse)"}
          >
            <ArrowUpDown className="size-3" />
            <span className="hidden sm:inline">Name</span> {sortAsc ? "A-Z" : "Z-A"}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <DocumentUpload
            onUpload={handleUpload}
            uploading={uploading}
            folderId={selectedFolderId}
            folderName={selectedFolderName}
          />

          {/* Child folders */}
          {childFolders.length > 0 && (
            <div className="divide-y">
              {childFolders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                  className="flex items-center gap-3 px-3 md:px-4 py-3 hover:bg-muted/50 w-full text-left transition-colors group"
                >
                  <FolderIcon className="size-5 text-muted-foreground group-hover:text-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{folder.name}</span>
                  </div>
                  {folder.document_count > 0 && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {folder.document_count} {folder.document_count === 1 ? "item" : "items"}
                    </span>
                  )}
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Documents list */}
          <DocumentList
            documents={filteredDocuments}
            onDelete={deleteDocument}
            onMoveDocument={handleMoveDocument}
          />

          {/* Empty state when no folders and no documents */}
          {childFolders.length === 0 && filteredDocuments.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              This folder is empty
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {dialogState.type === "create" && (
        <CreateFolderDialog
          open
          onOpenChange={(open) => { if (!open) closeDialog() }}
          onSubmit={async (name) => {
            await createFolder(name, dialogState.parentId)
          }}
        />
      )}

      {dialogState.type === "rename" && (
        <CreateFolderDialog
          open
          onOpenChange={(open) => { if (!open) closeDialog() }}
          onSubmit={async (name) => {
            await renameFolder(dialogState.folderId, name)
          }}
          initialName={dialogState.currentName}
        />
      )}

      {dialogState.type === "delete" && (
        <DeleteFolderDialog
          open
          onOpenChange={(open) => { if (!open) closeDialog() }}
          onConfirm={async () => {
            await deleteFolder(dialogState.folderId)
          }}
          folderName={dialogState.folderName}
        />
      )}

      {moveDialogState && (
        <MoveToFolderDialog
          open={moveDialogState.open}
          onOpenChange={(open) => {
            if (!open) setMoveDialogState(null)
          }}
          tree={tree}
          currentFolderId={moveDialogState.currentFolderId}
          onMove={handleMoveConfirm}
          itemName={moveDialogState.itemName}
        />
      )}
    </div>
  )
}
