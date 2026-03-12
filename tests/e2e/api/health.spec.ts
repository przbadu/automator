import { test, expect } from "@playwright/test";
import { BACKEND_URL } from "../fixtures/test-data";

test.describe("Health Endpoint", () => {
  test("GET /health returns status ok", async ({ request }) => {
    const resp = await request.get(`${BACKEND_URL}/health`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toEqual({ status: "ok" });
  });
});
