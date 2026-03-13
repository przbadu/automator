import { useCallback, useEffect, useState } from "react"
import type { MetadataFieldDefinition, MetadataFieldType } from "@/types"
import { useMetadataSchema } from "@/hooks/useMetadataSchema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"

const DATA_TYPES: { value: MetadataFieldType; label: string }[] = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Boolean" },
  { value: "list[string]", label: "List of Strings" },
]

const RESERVED_NAMES = new Set(["user_id", "document_id", "filename", "chunk_index"])

function emptyField(): MetadataFieldDefinition {
  return {
    name: "",
    display_label: "",
    data_type: "string",
    required: false,
    description: "",
  }
}

export function MetadataSchemaPanel() {
  const { schema, loading, loadSchema, saveSchema, resetToDefaults } =
    useMetadataSchema()
  const [fields, setFields] = useState<MetadataFieldDefinition[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    loadSchema()
  }, [loadSchema])

  useEffect(() => {
    if (schema) {
      setFields(schema.fields.map((f) => ({ ...f })))
      setDirty(false)
    }
  }, [schema])

  const updateField = useCallback(
    (index: number, updates: Partial<MetadataFieldDefinition>) => {
      setFields((prev) =>
        prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
      )
      setDirty(true)
    },
    []
  )

  const addField = useCallback(() => {
    setFields((prev) => [...prev, emptyField()])
    setDirty(true)
  }, [])

  const removeField = useCallback((index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index))
    setDirty(true)
  }, [])

  const validate = (): string | null => {
    if (fields.length === 0) return "At least one field is required"
    const names = new Set<string>()
    for (const f of fields) {
      if (!f.name.trim()) return "All fields must have a name"
      if (!/^[a-z][a-z0-9_]*$/.test(f.name))
        return `Invalid name "${f.name}". Use lowercase letters, numbers, and underscores (must start with a letter)`
      if (!f.display_label.trim()) return `Field "${f.name}" must have a display label`
      if (!f.description.trim()) return `Field "${f.name}" must have a description`
      if (RESERVED_NAMES.has(f.name))
        return `"${f.name}" is a reserved field name`
      if (names.has(f.name)) return `Duplicate field name "${f.name}"`
      names.add(f.name)
    }
    return null
  }

  const handleSave = async () => {
    setError("")
    setSuccess("")
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    try {
      await saveSchema(fields)
      setSuccess("Schema saved successfully")
      setDirty(false)
      setTimeout(() => setSuccess(""), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm("Reset to default fields? Your custom schema will be deleted.")) return
    setError("")
    setSuccess("")
    await resetToDefaults()
    setSuccess("Reset to defaults")
    setDirty(false)
    setTimeout(() => setSuccess(""), 3000)
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Define what metadata the LLM should extract from uploaded documents.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Changes apply to newly uploaded documents only.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleReset}>
            Reset to Defaults
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">
          {error}
        </div>
      )}
      {success && (
        <div className="text-sm text-green-600 bg-green-50 rounded-md px-3 py-2">
          {success}
        </div>
      )}

      <Separator />

      <div className="space-y-4">
        {fields.map((field, index) => (
          <div key={index} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Field {index + 1}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeField(index)}
                className="text-xs text-destructive"
              >
                Remove
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name (snake_case)</Label>
                <Input
                  value={field.name}
                  onChange={(e) => updateField(index, { name: e.target.value })}
                  placeholder="e.g. author_name"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Display Label</Label>
                <Input
                  value={field.display_label}
                  onChange={(e) =>
                    updateField(index, { display_label: e.target.value })
                  }
                  placeholder="e.g. Author Name"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data Type</Label>
                <select
                  value={field.data_type}
                  onChange={(e) =>
                    updateField(index, {
                      data_type: e.target.value as MetadataFieldType,
                    })
                  }
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {DATA_TYPES.map((dt) => (
                    <option key={dt.value} value={dt.value}>
                      {dt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch
                  checked={field.required}
                  onCheckedChange={(checked) =>
                    updateField(index, { required: checked })
                  }
                />
                <Label className="text-xs">Required</Label>
              </div>
            </div>

            <div>
              <Label className="text-xs">Description (used as LLM hint)</Label>
              <Textarea
                value={field.description}
                onChange={(e) =>
                  updateField(index, { description: e.target.value })
                }
                placeholder="Describe what this field should contain..."
                rows={2}
                className="mt-1"
              />
            </div>
          </div>
        ))}
      </div>

      <Button variant="outline" onClick={addField} className="w-full">
        + Add Field
      </Button>
    </div>
  )
}
