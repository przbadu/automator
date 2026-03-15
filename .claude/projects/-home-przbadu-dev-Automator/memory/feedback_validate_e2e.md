---
name: feedback_validate_e2e
description: Always validate features end-to-end in browser before declaring complete, not just compile/import checks
type: feedback
---

Always validate new features end-to-end before declaring them complete — TypeScript compilation and import checks are not sufficient.

**Why:** During Module 8 (sub-agents), the backend Pydantic model was missing fields (`sub_agent`, `target_document`) which caused metadata to be stripped during API serialization. This was only caught when the user tested manually in the browser. Import/compile checks didn't catch the data-path issue.

**How to apply:** After implementing a feature, trace the full data flow: backend save → database → API response serialization → frontend rendering. Use Playwright browser automation or API calls to verify the actual user-visible behavior, not just that code compiles.
