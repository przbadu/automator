import { useEffect, useState } from "react"
import type { LLMConfig, LLMConfigCreateInput } from "@/types"
import { useLLMConfigs } from "@/hooks/useLLMConfigs"
import { Button } from "@/components/ui/button"
import { LLMConfigForm } from "./LLMConfigForm"

export function LLMConfigPanel() {
  const { configs, loading, loadConfigs, createConfig, updateConfig, deleteConfig, setDefault } =
    useLLMConfigs()
  const [showForm, setShowForm] = useState(false)
  const [editConfig, setEditConfig] = useState<LLMConfig | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  const handleCreate = async (data: LLMConfigCreateInput) => {
    setSubmitting(true)
    try {
      await createConfig(data)
      setShowForm(false)
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async (data: LLMConfigCreateInput) => {
    if (!editConfig) return
    setSubmitting(true)
    try {
      await updateConfig(editConfig.id, data)
      setEditConfig(null)
      setShowForm(false)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this LLM configuration?")) return
    await deleteConfig(id)
  }

  if (showForm || editConfig) {
    return (
      <div className="max-w-lg">
        <h3 className="text-sm font-medium mb-4">
          {editConfig ? "Edit Configuration" : "Add Configuration"}
        </h3>
        <LLMConfigForm
          editConfig={editConfig}
          onSubmit={editConfig ? handleUpdate : handleCreate}
          onCancel={() => {
            setShowForm(false)
            setEditConfig(null)
          }}
          submitting={submitting}
        />
      </div>
    )
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>
  }

  if (configs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground mb-4">
          No LLM configurations yet. Add one to start chatting.
        </p>
        <Button onClick={() => setShowForm(true)}>Add Configuration</Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {configs.length} configuration{configs.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={() => setShowForm(true)}>
          Add Configuration
        </Button>
      </div>

      {configs.map((config) => (
        <div
          key={config.id}
          className="border rounded-lg p-4 space-y-2"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{config.name}</span>
              {config.is_default && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                  Default
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {!config.is_default && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDefault(config.id)}
                  className="text-xs"
                >
                  Set Default
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditConfig(config)
                  setShowForm(true)
                }}
                className="text-xs"
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(config.id)}
                className="text-xs text-destructive"
              >
                Delete
              </Button>
            </div>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Provider: {config.provider}</span>
            <span>Model: {config.model_name}</span>
            <span>Key: {config.api_key_masked}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
