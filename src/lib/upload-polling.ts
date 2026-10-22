export function uploadPollDelay(response: Pick<Response, "status" | "headers">, now = Date.now()) {
  if (response.status !== 429 && response.status !== 503) return 2000;
  const retry = response.headers.get("Retry-After")?.trim();
  if (!retry) return 10_000;
  const seconds = Number(retry);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry) - now;
  return Number.isFinite(delay) ? Math.max(2000, delay) : 10_000;
}
