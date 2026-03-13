import { request as playwrightRequest } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { BACKEND_URL, TEST_EMAIL, TEST_PASSWORD } from "./test-data";

/**
 * Typed API client wrapping Playwright's request context with auth headers.
 */
export class ApiClient {
  constructor(
    private request: APIRequestContext,
    private accessToken: string
  ) {}

  private headers() {
    return { Authorization: `Bearer ${this.accessToken}` };
  }

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

  // --- Auth ---

  async signup(email: string, password: string) {
    return this.request.post(`${BACKEND_URL}/auth/signup`, {
      data: { email, password },
    });
  }

  async login(email: string, password: string) {
    return this.request.post(`${BACKEND_URL}/auth/login`, {
      data: { email, password },
    });
  }

  async refresh(refreshToken: string) {
    return this.request.post(`${BACKEND_URL}/auth/refresh`, {
      data: { refresh_token: refreshToken },
    });
  }

  async me() {
    return this.request.get(`${BACKEND_URL}/auth/me`, {
      headers: this.headers(),
    });
  }

  // --- Threads ---

  async createThread(title = "Test Thread") {
    return this.request.post(`${BACKEND_URL}/threads`, {
      headers: { ...this.headers(), "Content-Type": "application/json" },
      data: { title },
    });
  }

  async listThreads() {
    return this.request.get(`${BACKEND_URL}/threads`, {
      headers: this.headers(),
    });
  }

  async getThread(id: string) {
    return this.request.get(`${BACKEND_URL}/threads/${id}`, {
      headers: this.headers(),
    });
  }

  async deleteThread(id: string) {
    return this.request.delete(`${BACKEND_URL}/threads/${id}`, {
      headers: this.headers(),
    });
  }

  // --- Messages ---

  async listMessages(threadId: string) {
    return this.request.get(`${BACKEND_URL}/threads/${threadId}/messages`, {
      headers: this.headers(),
    });
  }

  async sendMessage(threadId: string, content: string) {
    return this.request.post(`${BACKEND_URL}/threads/${threadId}/messages`, {
      headers: { ...this.headers(), "Content-Type": "application/json" },
      data: { content },
    });
  }

  async stopGeneration(threadId: string) {
    return this.request.post(`${BACKEND_URL}/threads/${threadId}/stop`, {
      headers: this.headers(),
    });
  }

  // --- Documents ---

  async uploadDocument(name: string, content: string, mimeType = "text/plain") {
    return this.request.post(`${BACKEND_URL}/documents/upload`, {
      headers: this.headers(),
      multipart: {
        file: {
          name,
          mimeType,
          buffer: Buffer.from(content),
        },
      },
    });
  }

  async uploadDocumentBuffer(name: string, buffer: Buffer, mimeType: string) {
    return this.request.post(`${BACKEND_URL}/documents/upload`, {
      headers: this.headers(),
      multipart: {
        file: {
          name,
          mimeType,
          buffer,
        },
      },
    });
  }

  async listDocuments() {
    return this.request.get(`${BACKEND_URL}/documents`, {
      headers: this.headers(),
    });
  }

  async getDocument(id: string) {
    return this.request.get(`${BACKEND_URL}/documents/${id}`, {
      headers: this.headers(),
    });
  }

  async deleteDocument(id: string) {
    return this.request.delete(`${BACKEND_URL}/documents/${id}`, {
      headers: this.headers(),
    });
  }

  // --- LLM Configs ---

  async createLLMConfig(data: {
    name: string;
    provider: string;
    api_key: string;
    model_name: string;
    api_url?: string;
    is_default?: boolean;
  }) {
    return this.request.post(`${BACKEND_URL}/llm-configs`, {
      headers: { ...this.headers(), "Content-Type": "application/json" },
      data,
    });
  }

  async listLLMConfigs() {
    return this.request.get(`${BACKEND_URL}/llm-configs`, {
      headers: this.headers(),
    });
  }

  async updateLLMConfig(
    id: string,
    data: Record<string, unknown>
  ) {
    return this.request.put(`${BACKEND_URL}/llm-configs/${id}`, {
      headers: { ...this.headers(), "Content-Type": "application/json" },
      data,
    });
  }

  async deleteLLMConfig(id: string) {
    return this.request.delete(`${BACKEND_URL}/llm-configs/${id}`, {
      headers: this.headers(),
    });
  }

  async getDefaultLLMConfig() {
    return this.request.get(`${BACKEND_URL}/llm-configs/default`, {
      headers: this.headers(),
    });
  }

  // --- Metadata Schemas ---

  async getMetadataSchema() {
    return this.request.get(`${BACKEND_URL}/metadata-schemas`, {
      headers: this.headers(),
    });
  }

  async saveMetadataSchema(fields: Record<string, unknown>[]) {
    return this.request.put(`${BACKEND_URL}/metadata-schemas`, {
      headers: { ...this.headers(), "Content-Type": "application/json" },
      data: { fields },
    });
  }

  async deleteMetadataSchema() {
    return this.request.delete(`${BACKEND_URL}/metadata-schemas`, {
      headers: this.headers(),
    });
  }

  async getDefaultMetadataSchema() {
    return this.request.get(`${BACKEND_URL}/metadata-schemas/defaults`, {
      headers: this.headers(),
    });
  }
}
