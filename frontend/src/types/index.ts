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

export interface SourceCitation {
  filename: string
  chunk_index: number
  preview: string
  relevance_score: number
  document_type: string | null
  document_id: string
}

export interface ChunkData {
  chunk_index: number
  content: string
}

export interface SubAgentToolCall {
  tool: string
  args: Record<string, unknown>
}

export interface SubAgentToolResult {
  tool: string
  summary: string
}

export interface SubAgentActivity {
  started: boolean
  document: string | null
  mode: "document_analysis" | "tools" | null
  toolCalls: SubAgentToolCall[]
  toolResults: SubAgentToolResult[]
  completed: boolean
}

export interface MessageMetadata {
  sources: SourceCitation[]
  sub_agent?: boolean
  target_document?: string
  tool_calls?: SubAgentToolCall[]
  tool_results?: SubAgentToolResult[]
}

export interface Message {
  id: string
  thread_id: string
  user_id: string
  role: "user" | "assistant"
  content: string
  metadata: MessageMetadata | null
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
  folder_id: string | null
  created_at: string
  updated_at: string
}

export interface Folder {
  id: string
  user_id: string
  name: string
  parent_id: string | null
  path: string
  created_at: string
  updated_at: string
}

export interface FolderTreeNode {
  id: string
  name: string
  path: string
  children: FolderTreeNode[]
  document_count: number
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
