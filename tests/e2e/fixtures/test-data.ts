import { randomUUID } from "crypto";

export const BACKEND_URL = process.env.BACKEND_URL || "http://0.0.0.0:8000";
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://0.0.0.0:5173";
export const TEST_EMAIL = "test@example.com";
export const TEST_PASSWORD = "password123";

export function uniqueEmail(): string {
  return `test-${randomUUID().slice(0, 8)}@example.com`;
}

export function sampleDocument(
  content?: string
): { name: string; mimeType: string; buffer: Buffer } {
  const defaultContent = [
    "Acme Corporation was founded in 2019 by Jane Smith.",
    "The company headquarters is located in Portland, Oregon.",
    "Acme specializes in renewable energy solutions.",
    "Their flagship product is the SolarMax 3000 panel.",
    "In 2023, Acme reported revenue of $42 million.",
  ].join("\n\n");

  return {
    name: "test-document.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(content ?? defaultContent),
  };
}
