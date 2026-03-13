/**
 * Parse a raw SSE response body into structured events.
 */
export interface SubAgentEvent {
  type: string;
  document?: string;
  tool?: string;
  args?: Record<string, unknown>;
  summary?: string;
}

export function parseSSEResponse(body: string): {
  deltas: string[];
  doneEvent: Record<string, unknown> | null;
  fullContent: string;
  errorEvent: Record<string, unknown> | null;
  sourcesEvent: Record<string, unknown> | null;
  subAgentEvents: SubAgentEvent[];
} {
  const deltas: string[] = [];
  let doneEvent: Record<string, unknown> | null = null;
  let errorEvent: Record<string, unknown> | null = null;
  let sourcesEvent: Record<string, unknown> | null = null;
  const subAgentEvents: SubAgentEvent[] = [];

  for (const line of body.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      const event = JSON.parse(line.slice(6));
      if (event.type === "delta" && event.content) {
        deltas.push(event.content);
      } else if (event.type === "done") {
        doneEvent = event;
      } else if (event.type === "error") {
        errorEvent = event;
      } else if (event.type === "sources") {
        sourcesEvent = event;
      } else if (
        event.type === "sub_agent_start" ||
        event.type === "sub_agent_tool_call" ||
        event.type === "sub_agent_tool_result" ||
        event.type === "sub_agent_end"
      ) {
        subAgentEvents.push(event);
      }
    } catch {
      // ignore parse errors
    }
  }

  return {
    deltas,
    doneEvent,
    fullContent: deltas.join(""),
    errorEvent,
    sourcesEvent,
    subAgentEvents,
  };
}
