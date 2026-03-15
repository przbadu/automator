import { test, expect } from "@playwright/test";
import { ApiClient } from "../fixtures/api-client";
import { BACKEND_URL, uniqueEmail } from "../fixtures/test-data";

test.describe("Folders API", () => {
  let client: ApiClient & { dispose: () => Promise<void> };
  const createdFolderIds: string[] = [];

  test.beforeAll(async () => {
    client = await ApiClient.create();
  });

  test.afterAll(async () => {
    // Cleanup: delete folders in reverse order (children first)
    for (const id of createdFolderIds.reverse()) {
      try {
        await client.deleteFolder(id);
      } catch {
        // Ignore errors (may already be deleted via cascade)
      }
    }
    await client.dispose();
  });

  // --- Folder CRUD (FOLDER-01) ---

  test("Create root folder returns 201 with correct path", async () => {
    const name = `reports-${Date.now()}`;
    const resp = await client.createFolder(name);
    expect(resp.status()).toBe(201);
    const folder = await resp.json();
    createdFolderIds.push(folder.id);
    expect(folder.name).toBe(name);
    expect(folder.path).toBe(`/${name}`);
    expect(folder.parent_id).toBeNull();
  });

  test("Create nested folder returns correct path", async () => {
    const parentResp = await client.createFolder("projects");
    expect(parentResp.status()).toBe(201);
    const parent = await parentResp.json();
    createdFolderIds.push(parent.id);

    const childResp = await client.createFolder("2024", parent.id);
    expect(childResp.status()).toBe(201);
    const child = await childResp.json();
    createdFolderIds.push(child.id);
    expect(child.path).toBe("/projects/2024");
    expect(child.parent_id).toBe(parent.id);
  });

  test("Create deeply nested folder (3+ levels)", async () => {
    const aResp = await client.createFolder("deep-a");
    const a = await aResp.json();
    createdFolderIds.push(a.id);

    const bResp = await client.createFolder("deep-b", a.id);
    const b = await bResp.json();
    createdFolderIds.push(b.id);

    const cResp = await client.createFolder("deep-c", b.id);
    const c = await cResp.json();
    createdFolderIds.push(c.id);

    const dResp = await client.createFolder("deep-d", c.id);
    const d = await dResp.json();
    createdFolderIds.push(d.id);

    expect(d.path).toBe("/deep-a/deep-b/deep-c/deep-d");
  });

  test("List folders returns all user folders", async () => {
    const resp = await client.listFolders();
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    // Should contain at least the folders we created above
    expect(body.folders.length).toBeGreaterThanOrEqual(3);
  });

  test("Get folder tree returns hierarchical structure", async () => {
    // Create a parent with 2 children for tree test
    const parentResp = await client.createFolder("tree-parent");
    const parent = await parentResp.json();
    createdFolderIds.push(parent.id);

    const child1Resp = await client.createFolder("tree-child-1", parent.id);
    const child1 = await child1Resp.json();
    createdFolderIds.push(child1.id);

    const child2Resp = await client.createFolder("tree-child-2", parent.id);
    const child2 = await child2Resp.json();
    createdFolderIds.push(child2.id);

    const treeResp = await client.getFolderTree(parent.id);
    expect(treeResp.status()).toBe(200);
    const tree = await treeResp.json();
    // Root of the subtree should be tree-parent
    const root = tree.tree.find(
      (n: { id: string }) => n.id === parent.id
    );
    expect(root).toBeDefined();
    expect(root.children.length).toBe(2);
  });

  test("Get single folder by ID", async () => {
    const createResp = await client.createFolder("single-get");
    const created = await createResp.json();
    createdFolderIds.push(created.id);

    const getResp = await client.getFolder(created.id);
    expect(getResp.status()).toBe(200);
    const folder = await getResp.json();
    expect(folder.id).toBe(created.id);
    expect(folder.name).toBe("single-get");
  });

  // --- Folder Rename (FOLDER-02) ---

  test("Rename folder updates name and path", async () => {
    const createResp = await client.createFolder("old-name");
    const created = await createResp.json();
    createdFolderIds.push(created.id);

    const renameResp = await client.renameFolder(created.id, "new-name");
    expect(renameResp.status()).toBe(200);
    const renamed = await renameResp.json();
    expect(renamed.name).toBe("new-name");
    expect(renamed.path).toBe("/new-name");
  });

  test("Rename folder updates descendant paths", async () => {
    const parentResp = await client.createFolder("rename-parent");
    const parent = await parentResp.json();
    createdFolderIds.push(parent.id);

    const childResp = await client.createFolder("child", parent.id);
    const child = await childResp.json();
    createdFolderIds.push(child.id);

    const grandchildResp = await client.createFolder("grandchild", child.id);
    const grandchild = await grandchildResp.json();
    createdFolderIds.push(grandchild.id);

    // Rename parent
    await client.renameFolder(parent.id, "renamed");

    // Verify descendant paths updated
    const childGet = await client.getFolder(child.id);
    const childUpdated = await childGet.json();
    expect(childUpdated.path).toBe("/renamed/child");

    const grandchildGet = await client.getFolder(grandchild.id);
    const grandchildUpdated = await grandchildGet.json();
    expect(grandchildUpdated.path).toBe("/renamed/child/grandchild");
  });

  test("Rename to duplicate name in same parent returns 409", async () => {
    const aResp = await client.createFolder("dup-a");
    const a = await aResp.json();
    createdFolderIds.push(a.id);

    const bResp = await client.createFolder("dup-b");
    const b = await bResp.json();
    createdFolderIds.push(b.id);

    const renameResp = await client.renameFolder(b.id, "dup-a");
    expect(renameResp.status()).toBe(409);
  });

  // --- Folder Delete (FOLDER-03) ---

  test("Delete folder returns 204", async () => {
    const createResp = await client.createFolder("to-delete");
    const created = await createResp.json();

    const deleteResp = await client.deleteFolder(created.id);
    expect(deleteResp.status()).toBe(204);

    const getResp = await client.getFolder(created.id);
    expect(getResp.status()).toBe(404);
  });

  test("Delete folder cascades to subfolders", async () => {
    const parentResp = await client.createFolder("cascade-parent");
    const parent = await parentResp.json();

    const childResp = await client.createFolder("cascade-child", parent.id);
    const child = await childResp.json();

    const deleteResp = await client.deleteFolder(parent.id);
    expect(deleteResp.status()).toBe(204);

    const childGet = await client.getFolder(child.id);
    expect(childGet.status()).toBe(404);
  });

  test("Delete nonexistent folder returns 404", async () => {
    const resp = await client.deleteFolder("00000000-0000-0000-0000-000000000000");
    expect(resp.status()).toBe(404);
  });

  // --- Folder Move (FOLDER-04) ---

  test("Move folder to different parent updates path", async () => {
    const aResp = await client.createFolder("move-a");
    const a = await aResp.json();
    createdFolderIds.push(a.id);

    const bResp = await client.createFolder("move-b");
    const b = await bResp.json();
    createdFolderIds.push(b.id);

    const moveResp = await client.moveFolder(b.id, a.id);
    expect(moveResp.status()).toBe(200);
    const moved = await moveResp.json();
    expect(moved.path).toBe("/move-a/move-b");
    expect(moved.parent_id).toBe(a.id);
  });

  test("Move folder updates descendant paths", async () => {
    const srcResp = await client.createFolder("move-src");
    const src = await srcResp.json();
    createdFolderIds.push(src.id);

    const childResp = await client.createFolder("move-child", src.id);
    const child = await childResp.json();
    createdFolderIds.push(child.id);

    const dstResp = await client.createFolder("move-dst");
    const dst = await dstResp.json();
    createdFolderIds.push(dst.id);

    await client.moveFolder(src.id, dst.id);

    const childGet = await client.getFolder(child.id);
    const childUpdated = await childGet.json();
    expect(childUpdated.path).toBe("/move-dst/move-src/move-child");
  });

  test("Move folder to root (parent_id=null)", async () => {
    const parentResp = await client.createFolder("root-parent");
    const parent = await parentResp.json();
    createdFolderIds.push(parent.id);

    const childResp = await client.createFolder("root-child", parent.id);
    const child = await childResp.json();
    createdFolderIds.push(child.id);

    const moveResp = await client.moveFolder(child.id, null);
    expect(moveResp.status()).toBe(200);
    const moved = await moveResp.json();
    expect(moved.path).toBe("/root-child");
    expect(moved.parent_id).toBeNull();
  });

  test("Move folder into own subtree returns 400", async () => {
    const aResp = await client.createFolder("cycle-a");
    const a = await aResp.json();
    createdFolderIds.push(a.id);

    const bResp = await client.createFolder("cycle-b", a.id);
    const b = await bResp.json();
    createdFolderIds.push(b.id);

    const moveResp = await client.moveFolder(a.id, b.id);
    expect(moveResp.status()).toBe(400);
  });

  test("Move folder to itself returns 400", async () => {
    const aResp = await client.createFolder("self-move");
    const a = await aResp.json();
    createdFolderIds.push(a.id);

    const moveResp = await client.moveFolder(a.id, a.id);
    expect(moveResp.status()).toBe(400);
  });

  // --- Validation ---

  test("Create folder with empty name returns 422", async () => {
    const resp = await client.createFolder("");
    expect(resp.status()).toBe(422);
  });

  test("Create folder with invalid characters returns 400", async () => {
    const resp = await client.createFolder("bad/name");
    expect(resp.status()).toBe(400);
  });

  test("Create folder with nonexistent parent_id returns 404", async () => {
    const resp = await client.createFolder(
      "orphan",
      "00000000-0000-0000-0000-000000000000"
    );
    expect(resp.status()).toBe(404);
  });

  // --- Folder Documents ---

  test("Get folder documents returns empty list for empty folder", async () => {
    const folderResp = await client.createFolder("docs-folder");
    const folder = await folderResp.json();
    createdFolderIds.push(folder.id);

    const docsResp = await client.getFolderDocuments(folder.id);
    expect(docsResp.status()).toBe(200);
    const body = await docsResp.json();
    expect(body.documents).toEqual([]);
  });

  test("Get documents for nonexistent folder returns 404", async () => {
    const resp = await client.getFolderDocuments(
      "00000000-0000-0000-0000-000000000000"
    );
    expect(resp.status()).toBe(404);
  });
});

test.describe("Folders API - Upload to Folder (DOC-01)", () => {
  let client: ApiClient & { dispose: () => Promise<void> };
  const createdFolderIds: string[] = [];
  const createdDocIds: string[] = [];

  test.beforeAll(async () => {
    client = await ApiClient.create();
  });

  test.afterAll(async () => {
    for (const id of createdDocIds) {
      try {
        await client.deleteDocument(id);
      } catch {
        // Ignore
      }
    }
    for (const id of createdFolderIds.reverse()) {
      try {
        await client.deleteFolder(id);
      } catch {
        // Ignore
      }
    }
    await client.dispose();
  });

  test("Upload document with folder_id associates document with folder", async () => {
    const folderResp = await client.createFolder(`upload-folder-${Date.now()}`);
    const folder = await folderResp.json();
    createdFolderIds.push(folder.id);

    const uploadResp = await client.uploadDocument(
      "folder-doc.txt",
      "Test document content for folder upload testing.",
      "text/plain",
      folder.id
    );
    expect(uploadResp.status()).toBe(201);
    const doc = await uploadResp.json();
    createdDocIds.push(doc.id);
    expect(doc.folder_id).toBe(folder.id);

    // Verify document appears in folder's document list
    const docsResp = await client.getFolderDocuments(folder.id);
    expect(docsResp.status()).toBe(200);
    const body = await docsResp.json();
    const found = body.documents.find((d: { id: string }) => d.id === doc.id);
    expect(found).toBeDefined();
  });

  test("Upload document without folder_id remains unfiled", async () => {
    const uploadResp = await client.uploadDocument(
      "unfiled-doc.txt",
      "Unfiled document content."
    );
    expect(uploadResp.status()).toBe(201);
    const doc = await uploadResp.json();
    createdDocIds.push(doc.id);
    expect(doc.folder_id).toBeNull();
  });

  test("Upload with nonexistent folder_id returns 404", async () => {
    const uploadResp = await client.uploadDocument(
      "bad-folder-doc.txt",
      "This should fail.",
      "text/plain",
      "00000000-0000-0000-0000-000000000000"
    );
    expect(uploadResp.status()).toBe(404);
  });
});

test.describe("Folders API - Move Document (DOC-02)", () => {
  let client: ApiClient & { dispose: () => Promise<void> };
  const createdFolderIds: string[] = [];
  const createdDocIds: string[] = [];

  test.beforeAll(async () => {
    client = await ApiClient.create();
  });

  test.afterAll(async () => {
    for (const id of createdDocIds) {
      try {
        await client.deleteDocument(id);
      } catch {
        // Ignore
      }
    }
    for (const id of createdFolderIds.reverse()) {
      try {
        await client.deleteFolder(id);
      } catch {
        // Ignore
      }
    }
    await client.dispose();
  });

  test("Move document to a folder", async () => {
    // Upload unfiled document
    const uploadResp = await client.uploadDocument(
      "move-to-folder.txt",
      "Document to move into a folder."
    );
    const doc = await uploadResp.json();
    createdDocIds.push(doc.id);
    expect(doc.folder_id).toBeNull();

    // Create folder
    const folderResp = await client.createFolder(`move-target-${Date.now()}`);
    const folder = await folderResp.json();
    createdFolderIds.push(folder.id);

    // Move document to folder
    const moveResp = await client.moveDocument(doc.id, folder.id);
    expect(moveResp.status()).toBe(200);
    const moved = await moveResp.json();
    expect(moved.folder_id).toBe(folder.id);

    // Verify document is listed in folder
    const docsResp = await client.getFolderDocuments(folder.id);
    const body = await docsResp.json();
    const found = body.documents.find((d: { id: string }) => d.id === doc.id);
    expect(found).toBeDefined();
  });

  test("Move document to unfiled (null folder_id)", async () => {
    // Create folder and upload document to it
    const folderResp = await client.createFolder(`unfiled-src-${Date.now()}`);
    const folder = await folderResp.json();
    createdFolderIds.push(folder.id);

    const uploadResp = await client.uploadDocument(
      "move-to-unfiled.txt",
      "Document to move to unfiled.",
      "text/plain",
      folder.id
    );
    const doc = await uploadResp.json();
    createdDocIds.push(doc.id);
    expect(doc.folder_id).toBe(folder.id);

    // Move to unfiled
    const moveResp = await client.moveDocument(doc.id, null);
    expect(moveResp.status()).toBe(200);
    const moved = await moveResp.json();
    expect(moved.folder_id).toBeNull();
  });

  test("Move document to different folder", async () => {
    // Create two folders
    const folderAResp = await client.createFolder(`folder-a-${Date.now()}`);
    const folderA = await folderAResp.json();
    createdFolderIds.push(folderA.id);

    const folderBResp = await client.createFolder(`folder-b-${Date.now()}`);
    const folderB = await folderBResp.json();
    createdFolderIds.push(folderB.id);

    // Upload to folder A
    const uploadResp = await client.uploadDocument(
      "move-between.txt",
      "Document to move between folders.",
      "text/plain",
      folderA.id
    );
    const doc = await uploadResp.json();
    createdDocIds.push(doc.id);
    expect(doc.folder_id).toBe(folderA.id);

    // Move to folder B
    const moveResp = await client.moveDocument(doc.id, folderB.id);
    expect(moveResp.status()).toBe(200);
    const moved = await moveResp.json();
    expect(moved.folder_id).toBe(folderB.id);
  });

  test("Move nonexistent document returns 404", async () => {
    const moveResp = await client.moveDocument(
      "00000000-0000-0000-0000-000000000000",
      null
    );
    expect(moveResp.status()).toBe(404);
  });

  test("Move document to nonexistent folder returns 404", async () => {
    const uploadResp = await client.uploadDocument(
      "move-bad-folder.txt",
      "Document for bad folder move."
    );
    const doc = await uploadResp.json();
    createdDocIds.push(doc.id);

    const moveResp = await client.moveDocument(
      doc.id,
      "00000000-0000-0000-0000-000000000000"
    );
    expect(moveResp.status()).toBe(404);
  });
});

test.describe("Folders API - Move Document User Isolation", () => {
  let client1: ApiClient & { dispose: () => Promise<void> };
  let client2: ApiClient & { dispose: () => Promise<void> };
  const cleanupDocIds: string[] = [];
  const cleanupFolderIds1: string[] = [];
  const cleanupFolderIds2: string[] = [];

  test.beforeAll(async () => {
    client1 = await ApiClient.create();

    // Create a second user
    const email2 = uniqueEmail();
    const password2 = "password123";
    const ctx2 = await (await import("@playwright/test")).request.newContext();
    await ctx2.post(`${BACKEND_URL}/auth/signup`, {
      data: { email: email2, password: password2 },
    });
    await ctx2.dispose();

    client2 = await ApiClient.create(email2, password2);
  });

  test.afterAll(async () => {
    for (const id of cleanupDocIds) {
      try {
        await client1.deleteDocument(id);
      } catch {
        // Ignore
      }
    }
    for (const id of cleanupFolderIds1.reverse()) {
      try {
        await client1.deleteFolder(id);
      } catch {
        // Ignore
      }
    }
    for (const id of cleanupFolderIds2.reverse()) {
      try {
        await client2.deleteFolder(id);
      } catch {
        // Ignore
      }
    }
    await client1.dispose();
    await client2.dispose();
  });

  test("Cannot move document to another user's folder", async () => {
    // User1 uploads a document
    const uploadResp = await client1.uploadDocument(
      "user1-doc.txt",
      "User1 document for cross-user move test."
    );
    const doc = await uploadResp.json();
    cleanupDocIds.push(doc.id);

    // User2 creates a folder
    const folderResp = await client2.createFolder(`user2-folder-${Date.now()}`);
    const folder = await folderResp.json();
    cleanupFolderIds2.push(folder.id);

    // User1 tries to move doc to User2's folder -- should get 404 (folder not found for user1)
    const moveResp = await client1.moveDocument(doc.id, folder.id);
    expect(moveResp.status()).toBe(404);
  });
});

test.describe("Folders API - User Isolation", () => {
  let client1: ApiClient & { dispose: () => Promise<void> };
  let client2: ApiClient & { dispose: () => Promise<void> };
  const cleanupFolderIds: string[] = [];

  test.beforeAll(async () => {
    client1 = await ApiClient.create();

    // Create a second user
    const email2 = uniqueEmail();
    const password2 = "password123";
    const ctx2 = await (await import("@playwright/test")).request.newContext();
    await ctx2.post(`${BACKEND_URL}/auth/signup`, {
      data: { email: email2, password: password2 },
    });
    await ctx2.dispose();

    client2 = await ApiClient.create(email2, password2);
  });

  test.afterAll(async () => {
    for (const id of cleanupFolderIds.reverse()) {
      try {
        await client1.deleteFolder(id);
      } catch {
        // Ignore
      }
    }
    await client1.dispose();
    await client2.dispose();
  });

  test("User cannot see other user's folders", async () => {
    const resp = await client1.createFolder("user1-private");
    const folder = await resp.json();
    cleanupFolderIds.push(folder.id);

    const listResp = await client2.listFolders();
    const body = await listResp.json();
    const found = body.folders.find(
      (f: { id: string }) => f.id === folder.id
    );
    expect(found).toBeUndefined();
  });

  test("User cannot delete other user's folder", async () => {
    const resp = await client1.createFolder("user1-nodelete");
    const folder = await resp.json();
    cleanupFolderIds.push(folder.id);

    const deleteResp = await client2.deleteFolder(folder.id);
    expect(deleteResp.status()).toBe(404);

    // Verify folder still exists for user1
    const getResp = await client1.getFolder(folder.id);
    expect(getResp.status()).toBe(200);
  });
});
