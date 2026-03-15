import { useEffect, useMemo, useState } from "react"
import { useDocuments } from "@/hooks/useDocuments"
import { useFolders } from "@/hooks/useFolders"
import { DocumentUpload } from "./DocumentUpload"
import { DocumentList } from "./DocumentList"
import { FolderTree } from "./FolderTree"
import { CreateFolderDialog } from "./CreateFolderDialog"
import { DeleteFolderDialog } from "./DeleteFolderDialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

interface Props {
  onLogout: () => void
  userEmail: string
}

type DialogState =
  | { type: "closed" }
  | { type: "create"; parentId: string | null }
  | { type: "rename"; folderId: string; currentName: string }
  | { type: "delete"; folderId: string; folderName: string }

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

export function DocumentsLayout({ onLogout, userEmail }: Props) {
  const { documents, uploading, loadDocuments, uploadDocument, deleteDocument } =
    useDocuments()
  const {
    tree,
    selectedFolderId,
    setSelectedFolderId,
    loadTree,
    createFolder,
    renameFolder,
    deleteFolder,
  } = useFolders()

  const [dialogState, setDialogState] = useState<DialogState>({ type: "closed" })

  useEffect(() => {
    loadDocuments()
    loadTree()
  }, [loadDocuments, loadTree])

  // Filter documents by selected folder
  const filteredDocuments = useMemo(() => {
    if (selectedFolderId === null) return documents
    return documents.filter((doc) => doc.folder_id === selectedFolderId)
  }, [documents, selectedFolderId])

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

  const closeDialog = () => setDialogState({ type: "closed" })

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r flex flex-col shrink-0 h-full overflow-hidden bg-sidebar">
        <div className="flex-1 overflow-hidden">
          <FolderTree
            tree={tree}
            selectedFolderId={selectedFolderId}
            onSelect={setSelectedFolderId}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
          />
        </div>
        <Separator />
        <div className="p-3 flex items-center justify-between shrink-0">
          <span className="text-xs text-muted-foreground truncate">
            {userEmail}
          </span>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            Logout
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <div className="px-4 py-3 border-b shrink-0 bg-background">
          <h2 className="font-semibold text-sm">
            {selectedFolderName
              ? `Documents > ${selectedFolderName}`
              : "Documents"}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          <DocumentUpload
            onUpload={uploadDocument}
            uploading={uploading}
          />
          <DocumentList documents={filteredDocuments} onDelete={deleteDocument} />
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
    </div>
  )
}
