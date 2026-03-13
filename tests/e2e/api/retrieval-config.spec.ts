import { test, expect } from "@playwright/test";
import { BACKEND_URL } from "../fixtures/test-data";

test.describe("Debug Retrieval Config Endpoint", () => {
  test("GET /debug/retrieval-config returns embedding config", async ({
    request,
  }) => {
    const resp = await request.get(`${BACKEND_URL}/debug/retrieval-config`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.embedding).toBeDefined();
    expect(typeof body.embedding.model).toBe("string");
    expect(body.embedding.model.length).toBeGreaterThan(0);
    expect(typeof body.embedding.base_url).toBe("string");
  });

  test("GET /debug/retrieval-config returns hybrid search config", async ({
    request,
  }) => {
    const resp = await request.get(`${BACKEND_URL}/debug/retrieval-config`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.hybrid_search).toBeDefined();
    expect(typeof body.hybrid_search.enabled).toBe("boolean");
    expect(typeof body.hybrid_search.rrf_k).toBe("number");
    expect(typeof body.hybrid_search.candidate_k).toBe("number");
    expect(typeof body.hybrid_search.final_top_k).toBe("number");
  });

  test("GET /debug/retrieval-config returns reranker config", async ({
    request,
  }) => {
    const resp = await request.get(`${BACKEND_URL}/debug/retrieval-config`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.reranker).toBeDefined();
    expect(typeof body.reranker.enabled).toBe("boolean");
    expect(typeof body.reranker.top_n).toBe("number");
  });

  test("GET /debug/retrieval-config returns chunking config", async ({
    request,
  }) => {
    const resp = await request.get(`${BACKEND_URL}/debug/retrieval-config`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.chunking).toBeDefined();
    expect(typeof body.chunking.chunk_size).toBe("number");
    expect(typeof body.chunking.chunk_overlap).toBe("number");
  });
});
