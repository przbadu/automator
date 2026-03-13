import { useEffect } from "react"
import { useDocuments } from "@/hooks/useDocuments"
import { DocumentUpload } from "./DocumentUpload"
import { DocumentList } from "./DocumentList"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

interface Props {
  onLogout: () => void
  userEmail: string
}

export function DocumentsLayout({ onLogout, userEmail }: Props) {
  const { documents, uploading, loadDocuments, uploadDocument, deleteDocument } =
    useDocuments()

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r flex flex-col shrink-0 h-full overflow-hidden bg-sidebar">
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-muted-foreground text-center">
            Upload and manage your documents for RAG-powered chat
          </p>
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
          <h2 className="font-semibold text-sm">Documents</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          <DocumentUpload
            onUpload={uploadDocument}
            uploading={uploading}
          />
          <DocumentList documents={documents} onDelete={deleteDocument} />
        </div>
      </div>
    </div>
  )
}
