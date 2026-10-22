export const maximumAdminJsonBytes = 64 * 1024;

export class JsonRequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new JsonRequestError("Send an application/json request.", 415);
  }
  if (Number(request.headers.get("content-length")) > maximumAdminJsonBytes) {
    await request.body?.cancel().catch(() => undefined);
    throw new JsonRequestError("This edit request is too large. Use 64 KiB or smaller.", 413);
  }
  if (!request.body) throw new JsonRequestError("Provide a valid JSON object.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumAdminJsonBytes) {
        throw new JsonRequestError("This edit request is too large. Use 64 KiB or smaller.", 413);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new JsonRequestError("Provide a valid JSON object.");
    return body as Record<string, unknown>;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof JsonRequestError) throw error;
    throw new JsonRequestError("Provide a valid UTF-8 JSON object.");
  } finally {
    reader.releaseLock();
  }
}
