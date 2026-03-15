# Phase 5: Folder Management UI - Research

**Researched:** 2026-03-15
**Domain:** React folder tree UI with drag-and-drop, shadcn/ui components
**Confidence:** HIGH

## Summary

Phase 5 builds a folder management UI in the ingestion/documents interface. The backend APIs already exist (Phase 2): folder CRUD, folder tree endpoint, document move, and upload-to-folder. The frontend currently shows a flat document list inside the Settings > Documents tab with no folder awareness. This phase adds a folder tree sidebar, folder CRUD dialogs, drag-drop for files/folders, and wires upload to the selected folder.

The project uses React 19 + Vite + Tailwind CSS 4 + shadcn/ui (base-nova style) + lucide-react icons. For drag-and-drop, the new `@dnd-kit/react` package (v0.3.x) supports React 19 natively and is the standard choice. For the tree component, a custom recursive React component is the right approach since the tree structure is simple (folders only, documents as leaves) and the backend already returns nested tree data via `GET /folders/tree`. shadcn/ui provides `context-menu`, `alert-dialog`, `dialog`, and `dropdown-menu` components that can be installed via the CLI.

**Primary recommendation:** Build a custom recursive `FolderTreeItem` component with `@dnd-kit/react` for drag-drop, shadcn `context-menu` for folder actions, and shadcn `alert-dialog` for delete confirmations. Restructure the Documents tab to show a two-panel layout: folder tree (left) + document list with upload (right).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UI-01 | Ingestion interface displays folder tree with navigable hierarchy (left sidebar) | Backend `GET /folders/tree` returns nested `FolderTreeNode` data. Build recursive `FolderTreeItem` component with expand/collapse state. |
| UI-02 | User can create, rename, and delete folders via UI with confirmation dialogs | Backend has `POST /folders`, `PATCH /folders/{id}`, `DELETE /folders/{id}`. Use shadcn `dialog` for create/rename, `alert-dialog` for delete confirmation. |
| UI-03 | File upload targets the currently selected folder via drag-drop | Backend `POST /documents/upload` already accepts `folder_id` form field. Pass `selectedFolderId` to `DocumentUpload` component. |
| UI-04 | User can move files between folders via drag-drop or context menu | Backend `PATCH /documents/{id}/move` accepts `folder_id`. Use `@dnd-kit/react` for drag-drop and shadcn `context-menu` for right-click move. |
| UI-05 | User can move folders with contents to a different parent | Backend `PATCH /folders/{id}/move` accepts `parent_id`. Same drag-drop and context menu mechanism as UI-04. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | ^19.2.0 | UI framework | Already in project |
| @dnd-kit/react | ^0.3.x | Drag and drop for tree + file moves | New React 19-native DnD package from dnd-kit, supports `react: ^18 \|\| ^19` |
| lucide-react | ^0.577.0 | Icons (Folder, FolderOpen, File, ChevronRight, etc.) | Already in project |
| shadcn/ui | ^4.0.5 | UI primitives (dialog, alert-dialog, context-menu, dropdown-menu) | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @dnd-kit/dom | ^0.3.x | Peer dependency of @dnd-kit/react | Required by @dnd-kit/react |
| @dnd-kit/abstract | ^0.3.x | Peer dependency of @dnd-kit/react | Required by @dnd-kit/react |
| @dnd-kit/state | ^0.3.x | Peer dependency of @dnd-kit/react | Required by @dnd-kit/react |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @dnd-kit/react | @dnd-kit/core + @dnd-kit/sortable (legacy) | Legacy API, not designed for React 19, more boilerplate |
| @dnd-kit/react | react-dnd | Older, heavier, less maintained |
| @dnd-kit/react | HTML5 native drag-and-drop | Poor accessibility, inconsistent cross-browser, no touch support |
| Custom tree component | Third-party shadcn tree-view | Added dependency for simple use case; our tree is just folders with documents |

**Installation:**
```bash
cd frontend && npm install @dnd-kit/react
```

**shadcn components to add:**
```bash
cd frontend && npx shadcn@latest add alert-dialog context-menu dropdown-menu
```

Note: `dialog` is already available in the project.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── components/
│   ├── documents/
│   │   ├── DocumentList.tsx          # Existing - show docs for selected folder
│   │   ├── DocumentsLayout.tsx       # REFACTOR - add folder tree sidebar
│   │   ├── DocumentUpload.tsx        # MODIFY - accept folderId prop
│   │   ├── DocumentStatusBadge.tsx   # Existing - no changes
│   │   ├── FolderTree.tsx            # NEW - tree container with DnD provider
│   │   ├── FolderTreeItem.tsx        # NEW - recursive tree node (expand/collapse, drag/drop)
│   │   ├── FolderContextMenu.tsx     # NEW - right-click menu for folder actions
│   │   ├── CreateFolderDialog.tsx    # NEW - dialog to create/rename folder
│   │   └── DeleteFolderDialog.tsx    # NEW - alert-dialog for delete confirmation
│   └── ...
├── hooks/
│   ├── useDocuments.ts               # MODIFY - add folder_id filtering, move doc
│   ├── useFolders.ts                 # NEW - folder CRUD, tree data, selected folder state
│   └── ...
├── types/
│   └── index.ts                      # MODIFY - add Folder and FolderTreeNode types
└── ...
```

### Pattern 1: Recursive Tree Component
**What:** Render folder tree as recursive `FolderTreeItem` components
**When to use:** Displaying the folder hierarchy with expand/collapse
**Example:**
```typescript
// FolderTreeItem.tsx
interface FolderTreeItemProps {
  node: FolderTreeNode
  level: number
  selectedFolderId: string | null
  onSelect: (folderId: string | null) => void
  onCreateFolder: (parentId: string) => void
  onRenameFolder: (folderId: string, currentName: string) => void
  onDeleteFolder: (folderId: string, name: string) => void
  onMoveFolder: (folderId: string, newParentId: string | null) => void
}

function FolderTreeItem({ node, level, selectedFolderId, onSelect, ...actions }: FolderTreeItemProps) {
  const [expanded, setExpanded] = useState(false)
  const hasChildren = node.children.length > 0

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger>
          <button
            className={cn("flex items-center gap-1 w-full px-2 py-1 text-sm rounded",
              selectedFolderId === node.id && "bg-accent"
            )}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            onClick={() => onSelect(node.id)}
          >
            {hasChildren && (
              <ChevronRight
                className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")}
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
              />
            )}
            {expanded ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
            <span className="truncate">{node.name}</span>
            {node.document_count > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">{node.document_count}</span>
            )}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => actions.onCreateFolder(node.id)}>New Subfolder</ContextMenuItem>
          <ContextMenuItem onClick={() => actions.onRenameFolder(node.id, node.name)}>Rename</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem className="text-destructive" onClick={() => actions.onDeleteFolder(node.id, node.name)}>
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {expanded && node.children.map(child => (
        <FolderTreeItem key={child.id} node={child} level={level + 1} ... />
      ))}
    </div>
  )
}
```

### Pattern 2: Two-Panel Layout for Documents Tab
**What:** Folder tree sidebar (left) + document list with upload (right)
**When to use:** The documents view in Settings
**Example:**
```typescript
// Restructured documents section
<div className="flex h-full">
  {/* Left: Folder tree */}
  <div className="w-56 border-r overflow-y-auto">
    <div className="p-2 flex items-center justify-between">
      <span className="text-xs font-medium">Folders</span>
      <Button variant="ghost" size="icon" onClick={() => createFolder(null)}>
        <FolderPlus className="h-4 w-4" />
      </Button>
    </div>
    <button onClick={() => setSelectedFolderId(null)} className={...}>
      All Documents
    </button>
    <FolderTree tree={folderTree} selectedFolderId={selectedFolderId} onSelect={setSelectedFolderId} />
  </div>
  {/* Right: Upload + document list filtered by selected folder */}
  <div className="flex-1 overflow-y-auto">
    <DocumentUpload onUpload={(file) => uploadDocument(file, selectedFolderId)} uploading={uploading} />
    <DocumentList documents={filteredDocuments} onDelete={deleteDocument} />
  </div>
</div>
```

### Pattern 3: Drag-Drop with @dnd-kit/react
**What:** Use `@dnd-kit/react` for dragging documents and folders
**When to use:** Moving files between folders, moving folders to new parent
**Example:**
```typescript
import { DragDropProvider } from '@dnd-kit/react'
import { useDraggable, useDroppable } from '@dnd-kit/react'

// Wrap the entire documents view
<DragDropProvider onDragEnd={handleDragEnd}>
  <FolderTree ... />
  <DocumentList ... />
</DragDropProvider>

// In FolderTreeItem - make it a drop target
function FolderTreeItem({ node, ... }) {
  const { ref } = useDroppable({ id: `folder-${node.id}`, data: { type: 'folder', folderId: node.id } })
  // Also make it draggable for folder moves
  return <div ref={ref}>...</div>
}

// In DocumentList items - make them draggable
function DocumentRow({ doc }) {
  const { ref } = useDraggable({ id: `doc-${doc.id}`, data: { type: 'document', docId: doc.id } })
  return <div ref={ref}>...</div>
}

// Handle drops
function handleDragEnd(event) {
  const { source, target } = event.operation
  if (!target) return
  const sourceData = source.data
  const targetData = target.data
  if (sourceData.type === 'document' && targetData.type === 'folder') {
    moveDocument(sourceData.docId, targetData.folderId)
  } else if (sourceData.type === 'folder' && targetData.type === 'folder') {
    moveFolder(sourceData.folderId, targetData.folderId)
  }
}
```

### Anti-Patterns to Avoid
- **Fetching documents per-folder on click:** Instead, fetch all documents once and filter client-side by `folder_id`. The backend already returns `folder_id` on each document.
- **Using `@dnd-kit/core` (legacy):** Use the new `@dnd-kit/react` package instead -- it's designed for React 19 and has a simpler API.
- **Storing expanded/selected state in URL:** For settings sub-tab, local component state is sufficient. No need for URL routing.
- **Making folder tree a separate route:** Keep it within the existing Settings > Documents tab. The requirement says "ingestion interface" which is the documents management area.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop | Custom mouse event handlers | @dnd-kit/react | Touch support, accessibility, keyboard DnD, drop indicators |
| Context menu | Custom right-click handler + positioned div | shadcn context-menu (Radix) | Keyboard navigation, focus management, portal rendering |
| Delete confirmation | window.confirm() | shadcn alert-dialog | Accessible, themed, consistent with app design |
| Create/rename form | Inline editing with contentEditable | shadcn dialog + input | Proper form validation, escape/enter handling, focus trapping |

**Key insight:** The backend APIs already handle all the business logic (validation, cascading deletes, path updates). The frontend just needs to call the right endpoints and display the tree structure.

## Common Pitfalls

### Pitfall 1: Dropping a Folder Into Its Own Descendant
**What goes wrong:** User drags folder A into folder B, but B is a child of A, creating a cycle
**Why it happens:** The frontend doesn't validate the drop target hierarchy
**How to avoid:** The backend `PATCH /folders/{id}/move` already validates and rejects circular moves. Show an error toast if the API returns an error. Optionally, prevent the drop visually by checking ancestry client-side.
**Warning signs:** API returns 400/409 on folder move

### Pitfall 2: Stale Tree After Mutations
**What goes wrong:** User creates/deletes/moves a folder but the tree doesn't update
**Why it happens:** Tree data not refetched after mutation
**How to avoid:** After any folder mutation (create, rename, delete, move), re-fetch the folder tree from `GET /folders/tree`. Same for document moves -- re-fetch documents list.
**Warning signs:** UI shows old state after actions

### Pitfall 3: DnD Conflicts with Click Handlers
**What goes wrong:** Clicking a folder to select it triggers a drag instead
**Why it happens:** Drag detection too sensitive, no activation delay
**How to avoid:** Configure `@dnd-kit/react` with a distance or delay activation constraint so short clicks are not interpreted as drags
**Warning signs:** Users can't click folders without accidentally starting a drag

### Pitfall 4: Upload Not Targeting Selected Folder
**What goes wrong:** Files uploaded while a folder is selected go to root/unfiled
**Why it happens:** `folder_id` not passed in the upload FormData
**How to avoid:** Pass the selected folder ID to the upload function. The backend already accepts `folder_id` as a form field in `POST /documents/upload`.
**Warning signs:** Newly uploaded files don't appear in the selected folder

### Pitfall 5: Document Type Missing folder_id
**What goes wrong:** TypeScript errors when accessing `doc.folder_id`
**Why it happens:** The `Document` type in `types/index.ts` currently lacks `folder_id` field
**How to avoid:** Add `folder_id: string | null` to the `Document` interface. The backend already returns it.
**Warning signs:** TypeScript compilation errors

## Code Examples

### Backend API Reference (Already Implemented)

```
# Folder CRUD
POST   /folders                    { name, parent_id? }         -> FolderResponse
GET    /folders                                                  -> FolderListResponse
GET    /folders/tree               ?root_id=                    -> FolderTreeResponse
GET    /folders/{id}                                            -> FolderResponse
PATCH  /folders/{id}               { name }                     -> FolderResponse (rename)
PATCH  /folders/{id}/move          { parent_id }                -> FolderResponse
DELETE /folders/{id}                                            -> 204

# Folder Documents
GET    /folders/{id}/documents                                  -> DocumentListResponse

# Document Upload (with folder targeting)
POST   /documents/upload           file + folder_id? (FormData) -> DocumentResponse

# Document Move
PATCH  /documents/{id}/move        { folder_id }                -> DocumentResponse
```

### FolderTreeNode Type (from backend model)
```typescript
// Add to types/index.ts
interface FolderTreeNode {
  id: string
  name: string
  path: string
  children: FolderTreeNode[]
  document_count: number
}

interface Folder {
  id: string
  user_id: string
  name: string
  parent_id: string | null
  path: string
  created_at: string
  updated_at: string
}
```

### useFolders Hook Pattern
```typescript
// hooks/useFolders.ts
export function useFolders() {
  const [tree, setTree] = useState<FolderTreeNode[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  const loadTree = useCallback(async () => {
    const res = await fetchWithAuth("/folders/tree")
    if (res.ok) {
      const data = await res.json()
      setTree(data.tree)
    }
  }, [])

  const createFolder = useCallback(async (name: string, parentId: string | null) => {
    const res = await fetchWithAuth("/folders", {
      method: "POST",
      body: JSON.stringify({ name, parent_id: parentId }),
    })
    if (res.ok) {
      await loadTree()
      return await res.json()
    }
    throw new Error("Failed to create folder")
  }, [loadTree])

  const renameFolder = useCallback(async (folderId: string, name: string) => {
    const res = await fetchWithAuth(`/folders/${folderId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    })
    if (res.ok) await loadTree()
  }, [loadTree])

  const deleteFolder = useCallback(async (folderId: string) => {
    const res = await fetchWithAuth(`/folders/${folderId}`, { method: "DELETE" })
    if (res.ok) {
      if (selectedFolderId === folderId) setSelectedFolderId(null)
      await loadTree()
    }
  }, [loadTree, selectedFolderId])

  const moveFolder = useCallback(async (folderId: string, newParentId: string | null) => {
    const res = await fetchWithAuth(`/folders/${folderId}/move`, {
      method: "PATCH",
      body: JSON.stringify({ parent_id: newParentId }),
    })
    if (res.ok) await loadTree()
  }, [loadTree])

  return { tree, selectedFolderId, setSelectedFolderId, loadTree, createFolder, renameFolder, deleteFolder, moveFolder }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @dnd-kit/core + @dnd-kit/sortable | @dnd-kit/react (new API) | 2024-2025 | Simpler API, React 19 native support |
| react-beautiful-dnd | @hello-pangea/dnd or @dnd-kit | 2022 (deprecated) | RBD unmaintained, use alternatives |
| Custom tree components | Still custom (no shadcn built-in) | N/A | shadcn has no official tree component; community solutions exist but are overkill for this use case |

**Note on @dnd-kit/react:** This is a newer package (v0.3.x, not yet 1.0). It has a simpler API than the legacy @dnd-kit/core but is pre-1.0. The API may have rough edges. If issues arise, fallback to implementing drag-drop via the legacy `@dnd-kit/core` + `@dnd-kit/sortable` packages (which also work with React 19 via `react: >=16.8.0` peer dep). Alternatively, drag-drop for folder/file moves could be implemented as a context-menu-only feature initially (simpler, more reliable) with drag-drop added as enhancement.

## Open Questions

1. **@dnd-kit/react API stability**
   - What we know: v0.3.x, supports React 19, published recently
   - What's unclear: API may change before 1.0; documentation may be sparse
   - Recommendation: Start with context menu for move operations (reliable). Add drag-drop as enhancement. If @dnd-kit/react has issues, fall back to @dnd-kit/core or context-menu-only approach.

2. **Settings vs. Dedicated Route for Documents**
   - What we know: Documents tab is currently inside Settings page
   - What's unclear: Whether the two-panel folder+documents layout fits well inside the Settings tab's `max-w-3xl` container
   - Recommendation: Remove the `max-w-3xl` constraint for the documents tab and let it fill the available space, or consider making documents a top-level route (`#/documents`)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | agent-browser CLI + curl |
| Config file | none (CLI tool, no config needed) |
| Quick run command | `curl -s http://0.0.0.0:8000/health \| jq .` |
| Full suite command | Manual validation via agent-browser |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-01 | Folder tree renders in sidebar with expand/collapse | e2e | `agent-browser open http://0.0.0.0:5173 && agent-browser snapshot -i` | No - Wave 0 |
| UI-02 | Create, rename, delete folders via dialogs | e2e | `agent-browser snapshot -i` + interact with dialogs | No - Wave 0 |
| UI-03 | Upload targets selected folder | integration | `curl -X POST http://0.0.0.0:8000/documents/upload -F file=@test.txt -F folder_id=<id>` | No - Wave 0 |
| UI-04 | Move files between folders | integration + e2e | `curl -X PATCH http://0.0.0.0:8000/documents/<id>/move -d '{"folder_id":"<id>"}'` | No - Wave 0 |
| UI-05 | Move folders to different parent | integration + e2e | `curl -X PATCH http://0.0.0.0:8000/folders/<id>/move -d '{"parent_id":"<id>"}'` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** Verify with curl (API) + agent-browser snapshot (UI)
- **Per wave merge:** Full e2e validation: login, navigate to documents, create folders, upload files, move items, verify tree
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- No automated test infrastructure needed -- validation is manual via agent-browser and curl
- Backend APIs already exist and were validated in Phase 2
- Frontend validation requires running dev server (`bin/dev`)

## Sources

### Primary (HIGH confidence)
- Project codebase: `backend/app/routers/folders.py`, `backend/app/routers/documents.py` -- confirmed all required APIs exist
- Project codebase: `frontend/package.json` -- confirmed React 19.2, shadcn 4.0.5, lucide-react 0.577
- Project codebase: `backend/app/models/folders.py` -- confirmed FolderTreeNode, MoveDocumentRequest models
- npm registry: `@dnd-kit/react` peerDependencies `react: ^18 || ^19` -- confirmed React 19 compatibility

### Secondary (MEDIUM confidence)
- [dnd-kit official docs](https://dndkit.com) -- API patterns and installation
- [shadcn/ui docs](https://ui.shadcn.com/docs/components/radix/context-menu) -- context-menu, alert-dialog installation
- [shadcn/ui docs](https://ui.shadcn.com/docs/components/radix/alert-dialog) -- alert-dialog component

### Tertiary (LOW confidence)
- [@dnd-kit/react npm](https://www.npmjs.com/package/@dnd-kit/react) -- v0.3.2, pre-1.0, API may evolve

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - React 19, shadcn/ui, lucide confirmed in project. @dnd-kit/react confirmed React 19 compatible.
- Architecture: HIGH - Backend APIs fully implemented and tested. Frontend component patterns follow existing project conventions.
- Pitfalls: MEDIUM - DnD interaction edge cases may surface during implementation. @dnd-kit/react is pre-1.0.

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable domain, but @dnd-kit/react may release new versions)
