import { test, expect } from "@playwright/test";
import { ApiClient } from "../fixtures/api-client";
import { BACKEND_URL } from "../fixtures/test-data";

let client: ApiClient & { dispose: () => Promise<void> };

test.describe("Metadata Schemas API", () => {
  test.beforeAll(async () => {
    client = await ApiClient.create();
  });

  test.beforeEach(async () => {
    // Reset to defaults before each test
    await client.deleteMetadataSchema();
  });

  test.afterAll(async () => {
    await client.deleteMetadataSchema();
    await client.dispose();
  });

  test("GET returns default fields when no custom schema exists", async () => {
    const resp = await client.getMetadataSchema();
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    expect(data.id).toBe("default");
    expect(data.fields.length).toBe(6);
    expect(data.fields[0].name).toBe("title");
    expect(data.fields[1].name).toBe("summary");
    expect(data.fields[2].name).toBe("document_type");
    expect(data.fields[3].name).toBe("language");
    expect(data.fields[4].name).toBe("topics");
    expect(data.fields[5].name).toBe("key_entities");
  });

  test("GET /defaults returns default field definitions", async () => {
    const resp = await client.getDefaultMetadataSchema();
    expect(resp.status()).toBe(200);
    const fields = await resp.json();
    expect(fields.length).toBe(6);
    expect(fields[0]).toMatchObject({
      name: "title",
      data_type: "string",
      required: true,
    });
  });

  test("PUT creates custom schema", async () => {
    const fields = [
      {
        name: "author",
        display_label: "Author",
        data_type: "string",
        required: true,
        description: "The document author",
      },
      {
        name: "page_count",
        display_label: "Page Count",
        data_type: "number",
        required: false,
        description: "Number of pages",
      },
    ];

    const resp = await client.saveMetadataSchema(fields);
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    expect(data.fields.length).toBe(2);
    expect(data.fields[0].name).toBe("author");
    expect(data.fields[1].name).toBe("page_count");
    expect(data.id).not.toBe("default");
  });

  test("PUT updates existing schema", async () => {
    // Create initial
    await client.saveMetadataSchema([
      {
        name: "title",
        display_label: "Title",
        data_type: "string",
        required: true,
        description: "Title",
      },
    ]);

    // Update with different fields
    const resp = await client.saveMetadataSchema([
      {
        name: "category",
        display_label: "Category",
        data_type: "string",
        required: false,
        description: "Document category",
      },
    ]);
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    expect(data.fields.length).toBe(1);
    expect(data.fields[0].name).toBe("category");
  });

  test("GET returns custom schema after save", async () => {
    await client.saveMetadataSchema([
      {
        name: "custom_field",
        display_label: "Custom",
        data_type: "boolean",
        required: false,
        description: "A custom boolean field",
      },
    ]);

    const resp = await client.getMetadataSchema();
    const data = await resp.json();
    expect(data.fields.length).toBe(1);
    expect(data.fields[0].name).toBe("custom_field");
    expect(data.fields[0].data_type).toBe("boolean");
  });

  test("DELETE reverts to defaults", async () => {
    // Save custom schema
    await client.saveMetadataSchema([
      {
        name: "custom",
        display_label: "Custom",
        data_type: "string",
        required: false,
        description: "Custom",
      },
    ]);

    // Delete
    const deleteResp = await client.deleteMetadataSchema();
    expect(deleteResp.status()).toBe(204);

    // Should return defaults
    const resp = await client.getMetadataSchema();
    const data = await resp.json();
    expect(data.id).toBe("default");
    expect(data.fields.length).toBe(6);
  });

  test("Validates field name format (rejects invalid)", async () => {
    const resp = await client.saveMetadataSchema([
      {
        name: "Invalid Name",
        display_label: "Invalid",
        data_type: "string",
        required: false,
        description: "Bad name",
      },
    ]);
    expect(resp.status()).toBe(422);
  });

  test("Validates data_type (rejects invalid)", async () => {
    const resp = await client.saveMetadataSchema([
      {
        name: "valid_name",
        display_label: "Valid",
        data_type: "invalid_type",
        required: false,
        description: "Bad type",
      },
    ]);
    expect(resp.status()).toBe(400);
  });

  test("Rejects reserved field names", async () => {
    const resp = await client.saveMetadataSchema([
      {
        name: "user_id",
        display_label: "User ID",
        data_type: "string",
        required: false,
        description: "Reserved name",
      },
    ]);
    expect(resp.status()).toBe(400);
    const data = await resp.json();
    expect(data.detail).toContain("reserved");
  });

  test("Requires at least one field", async () => {
    const resp = await client.saveMetadataSchema([]);
    expect(resp.status()).toBe(400);
    const data = await resp.json();
    expect(data.detail).toContain("At least one field");
  });

  test("Without auth returns 401", async ({ request }) => {
    const resp = await request.get(`${BACKEND_URL}/metadata-schemas`);
    expect(resp.status()).toBe(401);
  });

  test("Rejects duplicate field names", async () => {
    const resp = await client.saveMetadataSchema([
      {
        name: "title",
        display_label: "Title",
        data_type: "string",
        required: true,
        description: "Title",
      },
      {
        name: "title",
        display_label: "Title 2",
        data_type: "string",
        required: false,
        description: "Duplicate",
      },
    ]);
    expect(resp.status()).toBe(400);
    const data = await resp.json();
    expect(data.detail).toContain("Duplicate");
  });

  test("Document response includes metadata field", async () => {
    const uploadResp = await client.uploadDocument(
      "meta-test.txt",
      "Test content for metadata field check"
    );
    expect(uploadResp.status()).toBe(201);
    const doc = await uploadResp.json();

    // Newly uploaded doc should have metadata as null (extraction happens in background)
    expect(doc).toHaveProperty("metadata");

    // Cleanup
    await client.deleteDocument(doc.id);
  });
});
