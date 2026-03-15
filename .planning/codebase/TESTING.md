# Testing Patterns

**Analysis Date:** 2026-03-15 (Updated: agent-browser replaces Playwright)

## Test Tool

**Browser Automation:**
- `agent-browser` CLI — browser automation tool for AI agents
- Headless by default, uses Chromium
- No test runner framework — validation is done interactively by AI agents or via shell scripts

**API Testing:**
- `curl` or any HTTP client for direct API endpoint testing
- Backend at http://0.0.0.0:8000, frontend at http://0.0.0.0:5173

**Test Credentials:**
- Email: `test@example.com`
- Password: `password123`

## Validation Workflow

### API Validation
```bash
# Health check
curl -s http://0.0.0.0:8000/health | jq .

# Auth flow
curl -s -X POST http://0.0.0.0:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' | jq .

# Authenticated request (use token from login)
curl -s http://0.0.0.0:8000/threads \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### UI Validation with agent-browser
```bash
# 1. Open the app
agent-browser open http://0.0.0.0:5173

# 2. Get interactive elements
agent-browser snapshot -i
# Output: @e1 [input type="email"], @e2 [input type="password"], @e3 [button] "Sign In"

# 3. Interact using refs
agent-browser fill @e1 "test@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3

# 4. Wait and re-snapshot
agent-browser wait --load networkidle
agent-browser snapshot -i  # Get fresh refs after navigation

# 5. Verify result
agent-browser get url        # Check we navigated to chat
agent-browser get text body  # Check page content
agent-browser screenshot     # Visual verification
```

### Ref Lifecycle (Important)
Refs (`@e1`, `@e2`, etc.) are invalidated when the page changes. Always re-snapshot after:
- Clicking links or buttons that navigate
- Form submissions
- Dynamic content loading (dropdowns, modals)

## Common Validation Patterns

### Form Submission
```bash
agent-browser open http://0.0.0.0:5173
agent-browser snapshot -i
agent-browser fill @e1 "test@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser snapshot -i  # Verify result
```

### Chat Flow
```bash
# After login...
agent-browser snapshot -i
# Find and click "+ New Chat" button
agent-browser find role button click --name "+ New Chat"
agent-browser wait --load networkidle
agent-browser snapshot -i
# Type a message
agent-browser find placeholder "Type a message..." fill "Hello, how are you?"
agent-browser press Enter
agent-browser wait 3000  # Wait for LLM response
agent-browser snapshot -i  # Check response appeared
```

### Document Upload
```bash
# Navigate to documents tab
agent-browser snapshot -i
# Click documents/ingestion tab
agent-browser click @eN  # Use appropriate ref
agent-browser wait --load networkidle
agent-browser snapshot -i
# Upload a file
agent-browser upload @eN /path/to/file.txt
agent-browser wait --load networkidle
agent-browser snapshot -i  # Verify upload status
```

### Screenshot for Visual Verification
```bash
agent-browser screenshot                # Quick screenshot
agent-browser screenshot --full         # Full page
agent-browser screenshot result.png     # Named file
agent-browser screenshot --annotate     # Annotated (good for debugging)
```

### Semantic Locators (Alternative to Refs)
When refs are unavailable or unreliable:
```bash
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "user@test.com"
agent-browser find role button click --name "Submit"
agent-browser find placeholder "Search" type "query"
agent-browser find testid "submit-btn" click
```

## Test Data

**Test User:**
- Email: `test@example.com`
- Password: `password123`

**Sample Document Content:**
```
Acme Corporation was founded in 2019 by Jane Smith.
The company headquarters is located in Portland, Oregon.
Acme specializes in renewable energy solutions.
Their flagship product is the SolarMax 3000 panel.
In 2023, Acme reported revenue of $42 million.
```

## Critical Testing Requirements

From `CLAUDE.md`:
- **Every new backend service or pipeline step MUST have Langfuse tracing** — use `@observe(name="...")` decorator
- When building new features, validate:
  - API endpoints with curl/HTTP requests
  - UI features with `agent-browser` (open, interact, verify)
  - Take screenshots to confirm visual correctness
- **NEVER skip validation** — always verify features work end-to-end before declaring complete
- Test both happy path and error scenarios

## Running Validation

**Prerequisites:**
```bash
# Start dev servers
bin/dev

# Ensure agent-browser is installed
agent-browser --version
```

**Validation Steps:**
1. Start servers with `bin/dev`
2. Use `curl` to validate API endpoints
3. Use `agent-browser` to validate UI flows
4. Take screenshots for visual confirmation
5. Close browser when done: `agent-browser close`

---

*Testing analysis: 2026-03-15*
