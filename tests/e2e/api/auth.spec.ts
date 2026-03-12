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

  test("Login with wrong password returns 401", async ({ request }) => {
    const resp = await request.post(`${BACKEND_URL}/auth/login`, {
      data: { email: TEST_EMAIL, password: "wrongpassword" },
    });
    expect(resp.status()).toBe(401);
  });

  test("Login with nonexistent email returns 401", async ({ request }) => {
    const resp = await request.post(`${BACKEND_URL}/auth/login`, {
      data: { email: "nobody@example.com", password: "password" },
    });
    expect(resp.status()).toBe(401);
  });

  test("Signup with new unique email returns tokens", async ({ request }) => {
    const email = uniqueEmail();
    const resp = await request.post(`${BACKEND_URL}/auth/signup`, {
      data: { email, password: "testpass123" },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
  });

  test("Signup with existing email returns 409", async ({ request }) => {
    const resp = await request.post(`${BACKEND_URL}/auth/signup`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(resp.status()).toBe(409);
    const body = await resp.json();
    expect(body.detail).toContain("already registered");
  });

  test("GET /auth/me with valid token returns user", async ({ request }) => {
    const loginResp = await request.post(`${BACKEND_URL}/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const { access_token } = await loginResp.json();

    const resp = await request.get(`${BACKEND_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(resp.status()).toBe(200);
    const user = await resp.json();
    expect(user.id).toBeTruthy();
    expect(user.email).toBe(TEST_EMAIL);
    expect(user.created_at).toBeTruthy();
  });

  test("GET /auth/me without token returns 401", async ({ request }) => {
    const resp = await request.get(`${BACKEND_URL}/auth/me`);
    expect(resp.status()).toBe(401);
  });

  test("Refresh with valid refresh token returns new tokens", async ({ request }) => {
    const loginResp = await request.post(`${BACKEND_URL}/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const { refresh_token } = await loginResp.json();

    const resp = await request.post(`${BACKEND_URL}/auth/refresh`, {
      data: { refresh_token },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
  });

  test("Refresh with invalid token returns 401", async ({ request }) => {
    const resp = await request.post(`${BACKEND_URL}/auth/refresh`, {
      data: { refresh_token: "invalid.token.here" },
    });
    expect(resp.status()).toBe(401);
  });
});
