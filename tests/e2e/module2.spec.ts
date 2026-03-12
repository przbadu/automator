import { test, expect } from "@playwright/test";

const BACKEND_URL = "http://0.0.0.0:8000";
const FRONTEND_URL = "http://0.0.0.0:5173";
const TEST_EMAIL = "test@example.com";
const TEST_PASSWORD = "password123";

let accessToken = "";

test.describe("Module 2: Document Ingestion & Retrieval", () => {
  test.beforeAll(async ({ request }) => {
    // Login to get token
    const loginResp = await request.post(`${BACKEND_URL}/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(loginResp.ok()).toBeTruthy();
    const loginData = await loginResp.json();
    accessToken = loginData.access_token;
  });

  test("API: Upload a .txt document", async ({ request }) => {
    const testContent = [
      "Acme Corporation was founded in 2019 by Jane Smith.",
      "The company headquarters is located in Portland, Oregon.",
      "Acme specializes in renewable energy solutions.",
      "Their flagship product is the SolarMax 3000 panel.",
      "In 2023, Acme reported revenue of $42 million.",
    ].join("\n\n");

    const resp = await request.post(`${BACKEND_URL}/documents/upload`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      multipart: {
        file: {
          name: "acme-facts.txt",
          mimeType: "text/plain",
          buffer: Buffer.from(testContent),
        },
      },
    });

    expect(resp.ok()).toBeTruthy();
    const doc = await resp.json();
    expect(doc.filename).toBe("acme-facts.txt");
    expect(doc.status).toBe("pending");
    expect(doc.id).toBeTruthy();
  });

  test("API: List documents shows uploaded file", async ({ request }) => {
    const resp = await request.get(`${BACKEND_URL}/documents`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.documents.length).toBeGreaterThan(0);

    const acmeDoc = data.documents.find(
      (d: { filename: string }) => d.filename === "acme-facts.txt"
    );
    expect(acmeDoc).toBeTruthy();
  });

  test("API: Poll document until completed", async ({ request }) => {
    // List to find the document
    const listResp = await request.get(`${BACKEND_URL}/documents`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const listData = await listResp.json();
    const acmeDoc = listData.documents.find(
      (d: { filename: string }) => d.filename === "acme-facts.txt"
    );
    expect(acmeDoc).toBeTruthy();

    // Poll until completed or failed (max 60 seconds)
    let status = acmeDoc.status;
    let attempts = 0;
    while (status !== "completed" && status !== "failed" && attempts < 60) {
      await new Promise((r) => setTimeout(r, 1000));
      const resp = await request.get(
        `${BACKEND_URL}/documents/${acmeDoc.id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const doc = await resp.json();
      status = doc.status;
      attempts++;
    }

    expect(status).toBe("completed");
  });

  test("API: Chat response includes document context (RAG)", async ({
    request,
  }) => {
    // Create a thread
    const threadResp = await request.post(`${BACKEND_URL}/threads`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      data: { title: "RAG Test" },
    });
    expect(threadResp.ok()).toBeTruthy();
    const thread = await threadResp.json();

    // Send a message asking about the document content
    const msgResp = await request.post(
      `${BACKEND_URL}/threads/${thread.id}/messages`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        data: { content: "What is Acme Corporation's flagship product?" },
      }
    );
    expect(msgResp.ok()).toBeTruthy();

    // Read SSE response and concatenate deltas
    const body = await msgResp.text();
    let fullContent = "";
    for (const line of body.split("\n")) {
      if (line.startsWith("data: ")) {
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "delta" && event.content) {
            fullContent += event.content;
          }
        } catch {
          // ignore parse errors
        }
      }
    }
    // The response should reference SolarMax 3000 from the document
    expect(fullContent.toLowerCase()).toContain("solarmax");

    // Clean up thread
    await request.delete(`${BACKEND_URL}/threads/${thread.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  });

  test("API: Delete document removes it", async ({ request }) => {
    // Find the document
    const listResp = await request.get(`${BACKEND_URL}/documents`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const listData = await listResp.json();
    const acmeDoc = listData.documents.find(
      (d: { filename: string }) => d.filename === "acme-facts.txt"
    );

    if (acmeDoc) {
      const delResp = await request.delete(
        `${BACKEND_URL}/documents/${acmeDoc.id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      expect(delResp.status()).toBe(204);

      // Verify it's gone
      const afterResp = await request.get(`${BACKEND_URL}/documents`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const afterData = await afterResp.json();
      const gone = afterData.documents.find(
        (d: { id: string }) => d.id === acmeDoc.id
      );
      expect(gone).toBeFalsy();
    }
  });

  test("UI: Navigate to documents view", async ({ page }) => {
    await page.goto(FRONTEND_URL);

    // Login
    await page.getByPlaceholder(/email/i).fill(TEST_EMAIL);
    await page.getByPlaceholder(/password/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /log in|sign in/i }).click();

    // Wait for app to load
    await expect(
      page.getByText(/chat|new chat|select/i).first()
    ).toBeVisible({ timeout: 10000 });

    // Click Documents nav
    const docsButton = page.getByRole("button", { name: /documents/i });
    await expect(docsButton).toBeVisible();
    await docsButton.click();

    // Verify documents view loads
    await expect(page.getByText(/documents/i).first()).toBeVisible();
    await expect(
      page.getByText(/drag.*drop|browse files/i).first()
    ).toBeVisible();
  });
});
