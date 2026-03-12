/**
 * Parse a raw SSE response body into structured events.
 */
export function parseSSEResponse(body: string): {
  deltas: string[];
  doneEvent: Record<string, unknown> | null;
  fullContent: string;
  errorEvent: Record<string, unknown> | null;
} {
  const deltas: string[] = [];
  let doneEvent: Record<string, unknown> | null = null;
  let errorEvent: Record<string, unknown> | null = null;

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
  };
}
