export interface User {
  id: string
  email: string
  created_at: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface Thread {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  thread_id: string
  user_id: string
  role: "user" | "assistant"
  content: string
  metadata: string
  created_at: string
}

export type LLMProvider = "openai" | "gemini" | "anthropic" | "grok" | "openrouter" | "openai_compatible"

export interface LLMConfig {
  id: string
  user_id: string
  name: string
  provider: LLMProvider
  api_key_masked: string
  api_url: string | null
  model_name: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface LLMConfigCreateInput {
  name: string
  provider: LLMProvider
  api_key: string
  api_url?: string
  model_name: string
  is_default?: boolean
}

export interface LLMConfigUpdateInput {
  name?: string
  provider?: LLMProvider
  api_key?: string
  api_url?: string
  model_name?: string
  is_default?: boolean
}

export interface Document {
  id: string
  user_id: string
  filename: string
  file_size: number
  mime_type: string
  status: "pending" | "processing" | "converting" | "chunking" | "extracting_metadata" | "embedding" | "completed" | "failed"
  chunk_count: number
  error_message: string | null
  content_hash: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type MetadataFieldType = "string" | "number" | "date" | "boolean" | "list[string]"

export interface MetadataFieldDefinition {
  name: string
  display_label: string
  data_type: MetadataFieldType
  required: boolean
  description: string
}

export interface MetadataSchema {
  id: string
  user_id: string
  fields: MetadataFieldDefinition[]
  created_at: string
  updated_at: string
}

export interface UploadResult {
  doc: Document
  message: string | null
  variant: "success" | "info" | "warning"
}
