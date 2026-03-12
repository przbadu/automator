import type { ApiClient } from "./api-client";

/**
 * Delete all threads for the authenticated user.
 */
export async function deleteAllThreads(client: ApiClient): Promise<void> {
  const resp = await client.listThreads();
  if (!resp.ok()) return;
  const threads = await resp.json();
  for (const t of threads) {
    await client.deleteThread(t.id);
  }
}

/**
 * Delete all documents for the authenticated user.
 */
export async function deleteAllDocuments(client: ApiClient): Promise<void> {
  const resp = await client.listDocuments();
  if (!resp.ok()) return;
  const data = await resp.json();
  for (const d of data.documents) {
    await client.deleteDocument(d.id);
  }
}

/**
 * Delete all LLM configs for the authenticated user.
 */
export async function deleteAllLLMConfigs(client: ApiClient): Promise<void> {
  const resp = await client.listLLMConfigs();
  if (!resp.ok()) return;
  const configs = await resp.json();
  for (const c of configs) {
    await client.deleteLLMConfig(c.id);
  }
}
