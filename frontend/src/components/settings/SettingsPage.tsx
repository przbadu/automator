import { useEffect, useState } from "react"
import type { User } from "@/types"
import { useDocuments } from "@/hooks/useDocuments"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DocumentUpload } from "@/components/documents/DocumentUpload"
import { DocumentList } from "@/components/documents/DocumentList"
import { LLMConfigPanel } from "./LLMConfigPanel"
import { cn } from "@/lib/utils"

type SettingsTab = "llm" | "documents"

const SETTINGS_MENU: { key: SettingsTab; label: string }[] = [
  { key: "llm", label: "LLM Configurations" },
  { key: "documents", label: "Documents" },
]

interface Props {
  user: User
  onLogout: () => void
  onNavigateToChat: () => void
}

export function SettingsPage({ user, onLogout, onNavigateToChat }: Props) {
  const [tab, setTab] = useState<SettingsTab>("llm")
  const { documents, uploading, loadDocuments, uploadDocument, deleteDocument } =
    useDocuments()

  useEffect(() => {
    if (tab === "documents") {
      loadDocuments()
    }
  }, [tab, loadDocuments])

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar user={user} onLogout={onLogout} onOpenSettings={() => {}}>
        {/* Settings sub-sidebar content */}
        <div className="flex flex-col h-full">
          <div className="p-3">
            <button
              onClick={onNavigateToChat}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
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
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back to Chat
            </button>
            <h2 className="text-sm font-semibold mt-2">Settings</h2>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {SETTINGS_MENU.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setTab(item.key)}
                  className={cn(
                    "w-full text-left rounded-md px-3 py-2 text-sm transition-colors",
                    tab === item.key
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </AppSidebar>

      {/* Main content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <div className="px-4 py-3 border-b shrink-0 bg-background">
          <h2 className="font-semibold text-sm">
            {SETTINGS_MENU.find((m) => m.key === tab)?.label}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-4">
            {tab === "llm" ? (
              <LLMConfigPanel />
            ) : (
              <div>
                <DocumentUpload
                  onUpload={uploadDocument}
                  uploading={uploading}
                />
                <DocumentList documents={documents} onDelete={deleteDocument} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
