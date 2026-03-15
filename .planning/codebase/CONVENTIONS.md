# Coding Conventions

**Analysis Date:** 2026-03-15

## Naming Patterns

**Files:**
- Components: PascalCase (e.g., `ThreadList.tsx`, `LLMConfigForm.tsx`, `AuthService`)
- Services: camelCase with "Service" suffix (e.g., `authService.py`, `embeddingService.py`)
- Routes/routers: snake_case matching resource name (e.g., `auth.py`, `documents.py`, `llm_configs.py`)
- Models/types: PascalCase for classes and interfaces (e.g., `TokenResponse`, `DocumentResponse`)
- Utilities: camelCase (e.g., `api.ts`, `utils.ts`)

**Functions:**
- TypeScript/JavaScript: camelCase (e.g., `fetchWithAuth`, `createThread`, `deleteAllThreads`)
- Python: snake_case (e.g., `create_access_token`, `hash_password`, `get_current_user`)
- React hooks: camelCase starting with "use" (e.g., `useState`, `useEffect`, `useCallback`)

**Variables:**
- Constant collections: UPPER_SNAKE_CASE (e.g., `ALLOWED_EXTENSIONS`, `ALLOWED_MIME_TYPES`, `PROVIDERS`)
- Regular vars: camelCase (e.g., `apiKey`, `modelName`, `fetchedKeyRef`)
- Python module-level constants: UPPER_SNAKE_CASE (e.g., `BACKEND_URL`, `TEST_EMAIL`)

**Types:**
- Interfaces: PascalCase starting with "I" or just PascalCase without prefix (e.g., `ThreadListProps`, `LLMConfig`, `User`)
- Type aliases: PascalCase (e.g., `LLMProvider = "openai" | "gemini"`, `MetadataFieldType = "string" | "number"`)
- Pydantic models: PascalCase with "Request", "Response", or domain suffix (e.g., `SignUpRequest`, `TokenResponse`, `DocumentResponse`)

## Code Style

**Formatting:**
- Frontend: eslint 9.39+ with TypeScript ESLint, configured in `frontend/eslint.config.js`
- Uses flat config format (newer ESLint style)
- 2-space indentation (standard for JavaScript/TypeScript)
- No explicit Prettier config — ESLint handles linting; format is implicitly 2-space indentation
- Python backend: no explicit formatter configured, follows PEP 8 conventions

**Linting:**
- Frontend: `npm run lint` runs eslint
- Rules enforced:
  - TypeScript recommended config (`tseslint.configs.recommended`)
  - React hooks best practices (`reactHooks.configs.flat.recommended`)
  - React refresh rules (`reactRefresh.configs.vite`)
  - ES6 best practices (`js.configs.recommended`)
- Ignores: `dist/` directory
- Backend: No linting config detected; code follows Python conventions organically

## Import Organization

**Order (Frontend TypeScript):**
1. React imports (e.g., `import { useState }`)
2. Type imports (e.g., `import type { Thread }`)
3. Internal absolute imports from `@/` (e.g., `@/types`, `@/lib/api`, `@/components/ui/button`)
4. Relative imports (internal)
5. Third-party npm packages (e.g., `clsx`, `lucide-react`)

**Path Aliases:**
- Frontend: `@/` maps to `frontend/src/` (configured in TypeScript)
- Used throughout: `@/types`, `@/components`, `@/lib`, `@/hooks`
- Example: `import type { Thread } from "@/types"`

**Backend Python:**
- Standard library imports first
- Third-party imports second (fastapi, pydantic, langfuse, etc.)
- App-local imports last (from app.*)
- No path aliases; relative imports used within app package

## Error Handling

**Patterns:**

**Frontend (TypeScript):**
- Try-catch blocks for async operations
- `.catch(() => false)` for optional async operations where failure is acceptable
- `.catch(() => {})` for cleanup operations (fire-and-forget)
- Errors stored in component state: `const [error, setError] = useState("")`
- API errors extracted as: `const err = await res.json().catch(() => ({ detail: "..." }))`

Example from `LLMConfigForm.tsx`:
```typescript
try {
  const res = await fetchWithAuth("/llm-configs/models", {
    method: "POST",
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to fetch models" }))
    setModelsError(err.detail || "Failed to fetch models")
    return
  }
  // handle success
} catch {
  setModelsError("Network error fetching models")
} finally {
  setModelsLoading(false)
}
```

**Backend (FastAPI + Python):**
- HTTPException for API errors (e.g., `status.HTTP_400_BAD_REQUEST`, `status.HTTP_401_UNAUTHORIZED`)
- Exception messages provided via `detail` parameter
- Generic exception catching with broad `except Exception:` for token operations
- Status codes follow HTTP standards:
  - `200` - OK (default)
  - `201` - Created (POST responses)
  - `204` - No Content (DELETE success)
  - `400` - Bad Request (validation)
  - `401` - Unauthorized (auth failure)
  - `404` - Not Found
  - `409` - Conflict (duplicate email, etc.)
  - `500` - Server error (not explicitly caught, defaults)

Example from `auth.py`:
```python
if not row:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password",
    )
```

**Async/Await:**
- Python: `async def` functions with `await` for database, file I/O, API calls
- TypeScript: `async function` with `await` for fetch operations
- Both: Always await promises before using results

## Logging

**Framework:**
- Python: `logging` module (e.g., `logger = logging.getLogger(__name__)`)
- Frontend: `console.log()` for debugging only (not production logging)
- Backend services include logger setup in most files

**Patterns:**
- Python logger initialized at module level: `logger = logging.getLogger(__name__)`
- Used in services for tracing operations (e.g., in `ingestion_service.py`)
- Langfuse decorators used for structured observability instead of raw logs (see TESTING.md for details)

## Comments

**When to Comment:**
- Docstrings for all public functions/classes (Python)
- JSDoc/TSDoc for exported React components and utility functions
- Comments for non-obvious logic (e.g., filter conditions in `documents.py`)
- Comments explaining why, not what (code already shows what)

**JSDoc/TSDoc:**
- React component props: Interface `Props` or `interface ComponentNameProps`
- Functions: Parameter types and return types in TypeScript (auto-documenting)
- Docstrings in Python for non-obvious functions

Example from `api-client.ts`:
```typescript
/**
 * Typed API client wrapping HTTP request context with auth headers.
 */
export class ApiClient {
  /**
   * Create a standalone ApiClient (for use in beforeAll/afterAll hooks).
   * The caller must call client.dispose() when done.
   */
  static async create(...): Promise<ApiClient & { dispose: () => Promise<void> }> {
    ...
  }
}
```

## Function Design

**Size:**
- Aim for < 50 lines for most functions
- Async functions may be longer if handling multiple sequential operations
- Example: `auth.py` router endpoints are ~15-30 lines each

**Parameters:**
- Use destructuring in React components: `function ThreadList({ threads, currentThreadId, ... })`
- Use explicit params in Python: `async def login(req: LoginRequest, db: aiosqlite.Connection = Depends(get_db))`
- Dependency injection pattern in FastAPI: `Depends(get_current_user)` for middleware

**Return Values:**
- TypeScript: Explicit return types on all functions (enforced by TypeScript compiler)
- Python: Return type hints (e.g., `-> TokenResponse`, `-> str | None`)
- Early returns for error cases: `if not valid: return error_response`

## Module Design

**Exports:**
- Named exports for functions/classes: `export function fetchWithAuth(...)`
- Default exports only for React components: `export function ThreadList(...)`
- Barrel files exist: `frontend/src/components/ui/` exports all UI components

**Barrel Files:**
- Used in `ui/` components folder for re-exporting shadcn/ui components
- Not used elsewhere; direct imports preferred for clarity
- Example: `export { Button } from "@/components/ui/button"`

---

*Convention analysis: 2026-03-15*
