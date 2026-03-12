import { test, expect } from "@playwright/test";
import { ApiClient } from "../fixtures/api-client";
import { deleteAllLLMConfigs } from "../fixtures/cleanup";
import { BACKEND_URL } from "../fixtures/test-data";

let client: ApiClient & { dispose: () => Promise<void> };

test.describe("LLM Configs API", () => {
  test.beforeAll(async () => {
    client = await ApiClient.create();
  });

  test.beforeEach(async () => {
    await deleteAllLLMConfigs(client);
  });

  test.afterAll(async () => {
    await deleteAllLLMConfigs(client);
    await client.dispose();
  });

  test("First config auto-becomes default", async () => {
    const resp = await client.createLLMConfig({
      name: "First Config",
      provider: "openai",
      api_key: "sk-test-key-1234567890",
      model_name: "gpt-4",
    });
    expect(resp.status()).toBe(201);
    const config = await resp.json();
    expect(config.is_default).toBe(true);
  });

  test("Create returns masked API key", async () => {
    const resp = await client.createLLMConfig({
      name: "Masked Key Test",
      provider: "openai",
      api_key: "sk-test-key-abcdefgh",
      model_name: "gpt-4",
    });
    const config = await resp.json();
    expect(config.api_key_masked).toBeTruthy();
    expect(config.api_key_masked).toContain("...");
    expect(config.api_key_masked).not.toBe("sk-test-key-abcdefgh");
  });

  test("List configs returns created configs", async () => {
    await client.createLLMConfig({
      name: "Config A",
      provider: "openai",
      api_key: "sk-aaa-12345678",
      model_name: "gpt-4",
    });
    await client.createLLMConfig({
      name: "Config B",
      provider: "anthropic",
      api_key: "sk-ant-bbb-12345678",
      model_name: "claude-sonnet-4-20250514",
    });

    const listResp = await client.listLLMConfigs();
    expect(listResp.ok()).toBeTruthy();
    const configs = await listResp.json();
    expect(configs.length).toBe(2);
  });

  test("Update config name", async () => {
    const createResp = await client.createLLMConfig({
      name: "Old Name",
      provider: "openai",
      api_key: "sk-upd-12345678",
      model_name: "gpt-4",
    });
    const created = await createResp.json();

    const updateResp = await client.updateLLMConfig(created.id, {
      name: "New Name",
    });
    expect(updateResp.ok()).toBeTruthy();
    const updated = await updateResp.json();
    expect(updated.name).toBe("New Name");
    expect(updated.provider).toBe("openai");
    expect(updated.model_name).toBe("gpt-4");
  });

  test("Update API key shows new masked key", async () => {
    const createResp = await client.createLLMConfig({
      name: "Key Update",
      provider: "openai",
      api_key: "sk-old-key-aaaabbbb",
      model_name: "gpt-4",
    });
    const created = await createResp.json();
    const oldMask = created.api_key_masked;

    const updateResp = await client.updateLLMConfig(created.id, {
      api_key: "sk-new-key-ccccdddd",
    });
    const updated = await updateResp.json();
    expect(updated.api_key_masked).not.toBe(oldMask);
  });

  test("Set as default unsets previous default", async () => {
    const resp1 = await client.createLLMConfig({
      name: "Default 1",
      provider: "openai",
      api_key: "sk-def1-12345678",
      model_name: "gpt-4",
    });
    const config1 = await resp1.json();
    expect(config1.is_default).toBe(true);

    const resp2 = await client.createLLMConfig({
      name: "Default 2",
      provider: "anthropic",
      api_key: "sk-ant-def2-12345678",
      model_name: "claude-sonnet-4-20250514",
      is_default: true,
    });
    const config2 = await resp2.json();
    expect(config2.is_default).toBe(true);

    const listResp = await client.listLLMConfigs();
    const configs = await listResp.json();
    const c1 = configs.find((c: { id: string }) => c.id === config1.id);
    expect(c1.is_default).toBe(false);
  });

  test("Delete non-default config returns 204", async () => {
    await client.createLLMConfig({
      name: "Keep Me (Default)",
      provider: "openai",
      api_key: "sk-keep-12345678",
      model_name: "gpt-4",
    });
    const resp2 = await client.createLLMConfig({
      name: "Delete Me",
      provider: "anthropic",
      api_key: "sk-ant-del-12345678",
      model_name: "claude-sonnet-4-20250514",
    });
    const toDelete = await resp2.json();

    const delResp = await client.deleteLLMConfig(toDelete.id);
    expect(delResp.status()).toBe(204);

    const listResp = await client.listLLMConfigs();
    const configs = await listResp.json();
    expect(configs.length).toBe(1);
  });

  test("Delete default promotes next config", async () => {
    const resp1 = await client.createLLMConfig({
      name: "Will Be Default",
      provider: "openai",
      api_key: "sk-def-12345678",
      model_name: "gpt-4",
    });
    const defaultConfig = await resp1.json();

    const resp2 = await client.createLLMConfig({
      name: "Should Promote",
      provider: "anthropic",
      api_key: "sk-ant-pro-12345678",
      model_name: "claude-sonnet-4-20250514",
    });
    const otherConfig = await resp2.json();

    await client.deleteLLMConfig(defaultConfig.id);

    const listResp = await client.listLLMConfigs();
    const configs = await listResp.json();
    expect(configs.length).toBe(1);
    expect(configs[0].id).toBe(otherConfig.id);
    expect(configs[0].is_default).toBe(true);
  });

  test("Create without auth returns 401", async ({ request }) => {
    const resp = await request.post(`${BACKEND_URL}/llm-configs`, {
      data: {
        name: "No Auth",
        provider: "openai",
        api_key: "sk-noauth",
        model_name: "gpt-4",
      },
    });
    expect(resp.status()).toBe(401);
  });

  test("Get default config returns the default", async () => {
    await client.createLLMConfig({
      name: "My Default",
      provider: "openai",
      api_key: "sk-getdef-12345678",
      model_name: "gpt-4",
    });

    const resp = await client.getDefaultLLMConfig();
    expect(resp.ok()).toBeTruthy();
    const config = await resp.json();
    expect(config.is_default).toBe(true);
    expect(config.name).toBe("My Default");
  });

  test("Get default when none exist returns 404", async () => {
    const resp = await client.getDefaultLLMConfig();
    expect(resp.status()).toBe(404);
  });
});
