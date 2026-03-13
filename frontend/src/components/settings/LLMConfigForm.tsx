import { useCallback, useEffect, useRef, useState } from "react"
import type { LLMConfig, LLMConfigCreateInput, LLMProvider } from "@/types"
import { fetchWithAuth } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"

const PROVIDERS: { value: LLMProvider; label: string; hint?: string }[] = [
  { value: "openai", label: "OpenAI", hint: "api.openai.com" },
  { value: "anthropic", label: "Anthropic", hint: "Native SDK" },
  { value: "gemini", label: "Google Gemini", hint: "generativelanguage.googleapis.com" },
  { value: "grok", label: "Grok (xAI)", hint: "api.x.ai" },
  { value: "openrouter", label: "OpenRouter", hint: "openrouter.ai" },
  { value: "openai_compatible", label: "OpenAI Compatible", hint: "Custom URL" },
]

interface Props {
  editConfig?: LLMConfig | null
  onSubmit: (data: LLMConfigCreateInput) => Promise<void>
  onCancel: () => void
  submitting?: boolean
}

export function LLMConfigForm({ editConfig, onSubmit, onCancel, submitting }: Props) {
  const [name, setName] = useState("")
  const [provider, setProvider] = useState<LLMProvider>("openai")
  const [apiKey, setApiKey] = useState("")
  const [apiUrl, setApiUrl] = useState("")
  const [modelName, setModelName] = useState("")
  const [isDefault, setIsDefault] = useState(false)
  const [error, setError] = useState("")

  // Model fetching state
  const [models, setModels] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState("")
  const [modelsOpen, setModelsOpen] = useState(false)
  const fetchedKeyRef = useRef("")

  useEffect(() => {
    if (editConfig) {
      setName(editConfig.name)
      setProvider(editConfig.provider)
      setApiKey("")
      setApiUrl(editConfig.api_url || "")
      setModelName(editConfig.model_name)
      setIsDefault(editConfig.is_default)
    }
  }, [editConfig])

  // Reset fetched models when provider or api_url changes
  useEffect(() => {
    setModels([])
    setModelsError("")
    fetchedKeyRef.current = ""
  }, [provider, apiUrl])

  const fetchModels = useCallback(async () => {
    const key = apiKey.trim()
    if (!key) {
      setModelsError("Enter an API key first")
      return
    }
    if (provider === "openai_compatible" && !apiUrl.trim()) {
      setModelsError("Enter an API URL first")
      return
    }

    setModelsLoading(true)
    setModelsError("")
    try {
      const body: Record<string, string> = { provider, api_key: key }
      if (provider === "openai_compatible" && apiUrl.trim()) {
        body.api_url = apiUrl.trim()
      }
      const res = await fetchWithAuth("/llm-configs/models", {
        method: "POST",
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to fetch models" }))
        setModelsError(err.detail || "Failed to fetch models")
        setModels([])
        return
      }
      const data = await res.json()
      setModels(data.models)
      fetchedKeyRef.current = key
      if (data.models.length === 0) {
        setModelsError("No models returned by provider")
      }
    } catch {
      setModelsError("Network error fetching models")
    } finally {
      setModelsLoading(false)
    }
  }, [apiKey, provider, apiUrl])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!name.trim() || !modelName.trim()) {
      setError("Name and model are required")
      return
    }
    if (!editConfig && !apiKey.trim()) {
      setError("API key is required")
      return
    }
    if (provider === "openai_compatible" && !apiUrl.trim()) {
      setError("API URL is required for OpenAI Compatible provider")
      return
    }

    try {
      const data: LLMConfigCreateInput = {
        name: name.trim(),
        provider,
        api_key: apiKey.trim() || (editConfig ? "" : ""),
        model_name: modelName.trim(),
        is_default: isDefault,
      }
      if (provider === "openai_compatible" && apiUrl.trim()) {
        data.api_url = apiUrl.trim()
      }
      if (editConfig && !apiKey.trim()) {
        delete (data as Record<string, unknown>).api_key
      }
      await onSubmit(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    }
  }

  const providerHint = PROVIDERS.find((p) => p.value === provider)?.hint
  const canFetchModels = apiKey.trim().length > 0 && (provider !== "openai_compatible" || apiUrl.trim().length > 0)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="e.g. My OpenAI Key"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="provider">Provider</Label>
        <Select value={provider} onValueChange={(v) => setProvider(v as LLMProvider)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {providerHint && (
          <p className="text-xs text-muted-foreground">Endpoint: {providerHint}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="api_key">API Key</Label>
        <Input
          id="api_key"
          type="password"
          placeholder={editConfig ? "Leave blank to keep current key" : "sk-..."}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        {editConfig && (
          <p className="text-xs text-muted-foreground">
            Current: {editConfig.api_key_masked}
          </p>
        )}
      </div>

      {provider === "openai_compatible" && (
        <div className="space-y-2">
          <Label htmlFor="api_url">API URL</Label>
          <Input
            id="api_url"
            placeholder="http://localhost:11434/v1"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Model</Label>
        <div className="flex gap-2">
          <Popover open={modelsOpen} onOpenChange={setModelsOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={modelsOpen}
                className={cn(
                  "flex-1 justify-between font-normal",
                  !modelName && "text-muted-foreground",
                )}
              >
                <span className="truncate">
                  {modelName || "Select a model..."}
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="ml-2 shrink-0 opacity-50"
                >
                  <path d="m7 15 5 5 5-5" />
                  <path d="m7 9 5-5 5 5" />
                </svg>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Search or type model name..."
                  value={modelName}
                  onValueChange={setModelName}
                />
                <CommandList>
                  {models.length === 0 && !modelsLoading && (
                    <CommandEmpty>
                      {modelsError ? (
                        <span className="text-destructive text-xs">{modelsError}</span>
                      ) : canFetchModels ? (
                        <span className="text-xs">Click "Fetch Models" to load available models</span>
                      ) : (
                        <span className="text-xs">Enter API key{provider === "openai_compatible" ? " and URL" : ""} first</span>
                      )}
                    </CommandEmpty>
                  )}
                  {modelsLoading && (
                    <CommandEmpty>
                      <span className="text-xs text-muted-foreground">Fetching models...</span>
                    </CommandEmpty>
                  )}
                  {models.length > 0 && (
                    <CommandGroup>
                      {models.map((m) => (
                        <CommandItem
                          key={m}
                          value={m}
                          onSelect={(val) => {
                            setModelName(val)
                            setModelsOpen(false)
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={cn(
                              "mr-2 shrink-0",
                              modelName === m ? "opacity-100" : "opacity-0",
                            )}
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                          <span className="truncate">{m}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            disabled={!canFetchModels || modelsLoading}
            onClick={fetchModels}
          >
            {modelsLoading ? "Fetching..." : "Fetch Models"}
          </Button>
        </div>
        {modelsError && !modelsOpen && (
          <p className="text-xs text-destructive">{modelsError}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="is_default"
          checked={isDefault}
          onCheckedChange={setIsDefault}
        />
        <Label htmlFor="is_default">Set as default</Label>
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : editConfig ? "Update" : "Create"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
