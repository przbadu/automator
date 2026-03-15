# Testing Patterns

**Analysis Date:** 2026-03-15

## Test Framework

**Runner:**
- Playwright 1.58.2
- Config: `playwright.config.ts` in root
- Executes e2e tests in Node.js against running servers (backend at http://0.0.0.0:8000, frontend at http://0.0.0.0:5173)

**Assertion Library:**
- Playwright's built-in `expect()` function (matches Jest/Vitest syntax)
- Example: `expect(resp.status()).toBe(200)`, `expect(body.access_token).toBeTruthy()`

**Run Commands:**
```bash
npm test              # Run all tests (api + ui + llm) — requires live servers
npm run test:api      # API tests only (~3s) — no LLM needed
npm run test:ui       # UI tests only (~12s) — no LLM needed
npm run test:fast     # API + UI tests (~15s) — no LLM needed, preferred for regressions
npm run test:llm      # LLM-dependent tests only (~2min) — requires working LLM endpoint
```

## Test File Organization

**Location:**
- All tests in `tests/e2e/` directory
- Organized by type: `api/`, `ui/`, `llm/` subdirectories
- Co-location not used; tests are centralized

**Naming:**
- Pattern: `{feature}.spec.ts`
- Examples: `auth.spec.ts`, `documents.spec.ts`, `chat.spec.ts`
- All files have `.spec.ts` suffix for Playwright discovery

**Structure:**
```
tests/e2e/
├── api/                           # API-level tests (no browser UI)
│   ├── auth.spec.ts
│   ├── threads.spec.ts
│   ├── messages.spec.ts
│   ├── documents.spec.ts
│   ├── llm-configs.spec.ts
│   ├── metadata-schemas.spec.ts
│   ├── health.spec.ts
│   └── retrieval-config.spec.ts
├── ui/                            # Browser UI tests (Playwright Page automation)
│   ├── auth.spec.ts
│   ├── chat.spec.ts
│   ├── documents.spec.ts
│   ├── metadata-schema.spec.ts
│   └── settings.spec.ts
├── llm/                           # LLM-dependent tests (need live LLM)
│   ├── auto-title.spec.ts
│   ├── rag-retrieval.spec.ts
│   ├── chat-streaming.spec.ts
│   ├── text-to-sql.spec.ts
│   ├── web-search.spec.ts
│   ├── citations.spec.ts
│   ├── hybrid-search.spec.ts
│   └── sub-agent.spec.ts
└── fixtures/                      # Shared test helpers
    ├── test-data.ts               # Constants (BACKEND_URL, TEST_EMAIL, etc.)
    ├── auth.ts                    # apiLogin(), uiLogin() helpers
    ├── api-client.ts              # Typed API client with all endpoints
    ├── cleanup.ts                 # deleteAllThreads(), deleteAllDocuments(), etc.
    ├── sse.ts                     # parseSSEResponse() helper
    ├── sample.pdf                 # Test document file
    └── sample.html                # Test document file
```

## Test Structure

**Suite Organization:**

From `auth.spec.ts`:
```typescript
import { test, expect } from "@playwright/test";
import { BACKEND_URL, TEST_EMAIL, TEST_PASSWORD, uniqueEmail } from "../fixtures/test-data";

test.describe("Auth API", () => {
  test("Login with valid credentials returns tokens", async ({ request }) => {
    const resp = await request.post(`${BACKEND_URL}/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
    expect(body.token_type).toBe("bearer");
  });
});
```

**Patterns:**

1. **Test.describe():** Suite grouping by feature
2. **test():** Individual test case
3. **Setup/teardown:** `test.beforeAll()`, `test.afterAll()` for cross-test resources
   - Example from `threads.spec.ts`:
   ```typescript
   let client: ApiClient & { dispose: () => Promise<void> };
   const createdThreadIds: string[] = [];

   test.describe("Threads API", () => {
     test.beforeAll(async () => {
       client = await ApiClient.create();
     });

     test.afterAll(async () => {
       for (const id of createdThreadIds) {
         await client.deleteThread(id).catch(() => {});
       }
       createdThreadIds.length = 0;
       await client.dispose();
     });
   });
   ```
4. **Per-test setup:** `test.beforeEach()` for UI login, etc.
   - Example from `chat.spec.ts`:
   ```typescript
   test.beforeEach(async ({ page }) => {
     await uiLogin(page);
   });
   ```

## Mocking

**Framework:**
- No explicit mocking framework (Playwright doesn't provide one)
- Uses real API calls against live backend
- No database mocking; uses real SQLite + ChromaDB from test setup
- No HTTP mocking; all requests are real

**Patterns:**

**API Testing (no mocking needed):**
- Call real endpoints via `request.post()`, `request.get()`, etc.
- Example: `await request.post(`${BACKEND_URL}/auth/login`, { data: ... })`
- Use `ApiClient` class for typed, consistent calls

**UI Testing (no component mocking):**
- Full browser automation via Playwright
- Real DOM interaction, no component stubs
- Example: `await page.getByRole("button", { name: "+ New Chat" }).click()`

**What to Mock:**
- Nothing explicitly; integration tests verify actual behavior

**What NOT to Mock:**
- Real data (use `ApiClient.create()` to set up test data)
- API responses (test against live backend)
- Browser state (test against real UI)

**Test Data:**
- Shared fixtures in `tests/e2e/fixtures/test-data.ts`:
  ```typescript
  export const BACKEND_URL = "http://0.0.0.0:8000";
  export const TEST_EMAIL = "test@example.com";
  export const TEST_PASSWORD = "password123";

  export function uniqueEmail(): string {
    return `test-${randomUUID().slice(0, 8)}@example.com`;
  }

  export function sampleDocument(content?: string) {
    return {
      name: "test-document.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(content ?? defaultContent),
    };
  }
  ```

## Fixtures and Factories

**Test Data:**

Example from `test-data.ts`:
```typescript
export function sampleDocument(
  content?: string
): { name: string; mimeType: string; buffer: Buffer } {
  const defaultContent = [
    "Acme Corporation was founded in 2019 by Jane Smith.",
    "The company headquarters is located in Portland, Oregon.",
    "Acme specializes in renewable energy solutions.",
    "Their flagship product is the SolarMax 3000 panel.",
    "In 2023, Acme reported revenue of $42 million.",
  ].join("\n\n");

  return {
    name: "test-document.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(content ?? defaultContent),
  };
}
```

**Location:**
- `tests/e2e/fixtures/test-data.ts` - Constants and factories
- `tests/e2e/fixtures/api-client.ts` - Typed API client for all endpoints
- `tests/e2e/fixtures/auth.ts` - Login helpers (API and UI)
- `tests/e2e/fixtures/cleanup.ts` - Bulk cleanup utilities
- `tests/e2e/fixtures/sse.ts` - SSE response parsing helper

**ApiClient Factory:**

From `api-client.ts`:
```typescript
/**
 * Create a standalone ApiClient (for use in beforeAll/afterAll hooks).
 * The caller must call client.dispose() when done.
 */
static async create(
  email = TEST_EMAIL,
  password = TEST_PASSWORD
): Promise<ApiClient & { dispose: () => Promise<void> }> {
  const ctx = await playwrightRequest.newContext();
  const loginResp = await ctx.post(`${BACKEND_URL}/auth/login`, {
    data: { email, password },
  });
  const { access_token } = await loginResp.json();
  const client = new ApiClient(ctx, access_token) as ApiClient & {
    dispose: () => Promise<void>;
  };
  client.dispose = () => ctx.dispose();
  return client;
}
```

## Coverage

**Requirements:**
- No explicit coverage threshold enforced
- Pragmatic approach: test critical paths (auth, data CRUD, chat streaming)
- 69 tests total covering: auth, threads, messages, documents, LLM configs, metadata schemas, UI flows, chat streaming, RAG, auto-title, citations, hybrid search, web search, sub-agent

**View Coverage:**
- Not configured in Playwright setup
- Would require separate coverage tool (e.g., Istanbul)
- Current approach: count tests and visual inspection of test spec files

## Test Types

**Unit Tests:**
- Not used; codebase uses integration/e2e tests only
- No unit test framework (Jest, Vitest) configured
- Philosophy: test behavior end-to-end rather than isolated units

**Integration Tests:**
- API tests against live backend with real database
- Example: `auth.spec.ts` tests signup → login → refresh cycle with real users in SQLite
- Example: `documents.spec.ts` uploads documents, polls for completion, verifies they're in database

**E2E Tests:**
- UI tests with Playwright browser automation
- Example: `chat.spec.ts` logs in via UI, creates threads, sends messages
- Example: `rag-retrieval.spec.ts` uploads a document, asks a question, verifies response contains relevant content
- LLM tests that verify streaming, citations, RAG retrieval with live LLM endpoint

## Common Patterns

**Async Testing:**

From `rag-retrieval.spec.ts`:
```typescript
test("Upload doc, ask about content, response references it", async () => {
  const client = await ApiClient.create();

  try {
    // Upload with retry polling
    const uploadResp = await client.uploadDocument("zephyr-facts.txt", testContent);
    expect(uploadResp.status()).toBe(201);
    const doc = await uploadResp.json();

    // Poll until completed
    let status = "pending";
    let attempts = 0;
    while (status !== "completed" && status !== "failed" && attempts < 60) {
      await new Promise((r) => setTimeout(r, 1000));
      const resp = await client.getDocument(doc.id);
      const d = await resp.json();
      status = d.status;
      attempts++;
    }
    expect(status).toBe("completed");

    // Continue with chat test
  } finally {
    await client.dispose();
  }
});
```

**Error Testing:**

From `auth.spec.ts`:
```typescript
test("Login with wrong password returns 401", async ({ request }) => {
  const resp = await request.post(`${BACKEND_URL}/auth/login`, {
    data: { email: TEST_EMAIL, password: "wrongpassword" },
  });
  expect(resp.status()).toBe(401);
});

test("Signup with existing email returns 409", async ({ request }) => {
  const resp = await request.post(`${BACKEND_URL}/auth/signup`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  expect(resp.status()).toBe(409);
  const body = await resp.json();
  expect(body.detail).toContain("already registered");
});
```

**SSE Streaming Testing:**

From `rag-retrieval.spec.ts`:
```typescript
const msgResp = await client.sendMessage(
  thread.id,
  "What is Zephyr Dynamics' flagship product?"
);
expect(msgResp.ok()).toBeTruthy();

const body = await msgResp.text();
const { fullContent } = parseSSEResponse(body);

// Response should reference the QuantumCore X9
expect(fullContent.toLowerCase()).toContain("quantumcore");
```

**UI Interaction Testing:**

From `chat.spec.ts`:
```typescript
test("New Chat button creates a thread in sidebar", async ({ page, request }) => {
  const token = await apiLogin(request);
  const client = new ApiClient(request, token);
  await deleteAllThreads(client);
  await page.reload();
  await expect(page.getByRole("button", { name: "+ New Chat" })).toBeVisible({ timeout: 5000 });

  await page.getByRole("button", { name: "+ New Chat" }).click();
  await page.waitForTimeout(500);

  const sidebar = page.locator(".w-64");
  await expect(sidebar.locator(".cursor-pointer").first()).toBeVisible({ timeout: 5000 });
});
```

## Test Utilities

**Playwright Fixtures (built-in):**
- `page` - Browser page object for UI tests
- `request` - APIRequestContext for making HTTP calls
- Both are automatically injected by Playwright

**Custom Helpers:**

1. **ApiClient** (`fixtures/api-client.ts`):
   - Typed wrapper around Playwright's `request`
   - Methods for all endpoints: `createThread()`, `uploadDocument()`, `sendMessage()`, etc.
   - Automatic auth header injection
   - Static factory: `await ApiClient.create()` for beforeAll/afterAll

2. **Auth Helpers** (`fixtures/auth.ts`):
   - `apiLogin(request)` - HTTP login, returns access token
   - `uiLogin(page)` - Browser login via UI form

3. **Cleanup Helpers** (`fixtures/cleanup.ts`):
   - `deleteAllThreads(client)` - Bulk delete all user's threads
   - `deleteAllDocuments(client)` - Bulk delete all user's documents
   - `deleteAllLLMConfigs(client)` - Bulk delete all user's LLM configs

4. **SSE Parser** (`fixtures/sse.ts`):
   - `parseSSEResponse(body: string)` - Parse SSE stream into `fullContent` and `messages`

## Running Tests

**Local Development:**
```bash
# Terminal 1: Start dev servers
bin/dev

# Terminal 2: Run tests
npm test              # All tests
npm run test:fast     # API + UI (recommended for regression checks)
npm run test:llm      # Only LLM tests (after api/ui pass)
```

**Pre-commit:**
- Run `npm run test:fast` before committing to verify no regressions
- LLM tests optional for commits (long-running)

**CI/CD:**
- Full test suite on every push: `npm test`

## Critical Testing Requirements

From `CLAUDE.md`:
- **Every new backend service or pipeline step MUST have Langfuse tracing** — use `@observe(name="...")` decorator
- When building new features, add tests in `tests/e2e/`:
  - API tests for new endpoints
  - UI tests for new pages/components
  - LLM tests if feature involves LLM behavior
- **NEVER merge code with failing tests** — fix the feature or the tests
- Use shared fixtures in `tests/e2e/fixtures/` — don't duplicate patterns
- Run `npm run test:fast` before considering feature complete

---

*Testing analysis: 2026-03-15*
