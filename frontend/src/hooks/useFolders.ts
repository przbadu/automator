import { useCallback, useState } from "react"
import type { Folder, FolderTreeNode } from "@/types"
import { fetchWithAuth } from "@/lib/api"

export function useFolders() {
  const [tree, setTree] = useState<FolderTreeNode[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadTree = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithAuth("/folders/tree")
      if (res.ok) {
        const data = await res.json()
        setTree(data.tree)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const createFolder = useCallback(
    async (name: string, parentId: string | null): Promise<Folder> => {
      const body: Record<string, unknown> = { name }
      if (parentId) body.parent_id = parentId
      const res = await fetchWithAuth("/folders", {
        method: "POST",
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to create folder" }))
        throw new Error(err.detail || "Failed to create folder")
      }
      const folder = (await res.json()) as Folder
      await loadTree()
      return folder
    },
    [loadTree],
  )

  const renameFolder = useCallback(
    async (folderId: string, name: string): Promise<void> => {
      const res = await fetchWithAuth(`/folders/${folderId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to rename folder" }))
        throw new Error(err.detail || "Failed to rename folder")
      }
      await loadTree()
    },
    [loadTree],
  )

  const deleteFolder = useCallback(
    async (folderId: string): Promise<void> => {
      const res = await fetchWithAuth(`/folders/${folderId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to delete folder" }))
        throw new Error(err.detail || "Failed to delete folder")
      }
      setSelectedFolderId((prev) => (prev === folderId ? null : prev))
      await loadTree()
    },
    [loadTree],
  )

  const moveFolder = useCallback(
    async (folderId: string, newParentId: string | null): Promise<void> => {
      const res = await fetchWithAuth(`/folders/${folderId}/move`, {
        method: "PATCH",
        body: JSON.stringify({ parent_id: newParentId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to move folder" }))
        throw new Error(err.detail || "Failed to move folder")
      }
      await loadTree()
    },
    [loadTree],
  )

  return {
    tree,
    selectedFolderId,
    setSelectedFolderId,
    loading,
    loadTree,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
  }
}
