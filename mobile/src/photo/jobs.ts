/** In-memory only. An uncertain submission stays blocked across screen visits.
 * This cannot prevent duplicates after process death; the server needs idempotency keys for that. */
export const pendingSubmissions = new Set<string>();
export function reserveSubmission(productId: string): boolean {
  if (pendingSubmissions.has(productId)) return false;
  pendingSubmissions.add(productId);
  return true;
}
export function validJobId(value: unknown): value is string {
  return typeof value === "string" && /^[-a-zA-Z0-9_]{1,200}$/.test(value);
}
export async function pollJob(options: {
  id: string;
  read: (path: string) => Promise<{
    ok: boolean;
    json: () => Promise<{
      status: string;
    }>;
  }>;
  active: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<"succeeded" | "failed" | "stopped" | "timeout"> {
  if (!validJobId(options.id))
    throw new Error(
      "Invalid job response. Do not submit again until the outcome is confirmed.",
    );
  const sleep =
    options.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + 90000;
  for (let attempt = 0; attempt < 60 && now() < deadline; attempt++) {
    await sleep(1500);
    if (!options.active()) return "stopped";
    const response = await options.read(
      "/api/try-on/" + encodeURIComponent(options.id),
    );
    if (!options.active()) return "stopped";
    if (!response.ok)
      throw new Error("Could not check the job. It may still be running.");
    const job = await response.json();
    if (!options.active()) return "stopped";
    if (job.status === "succeeded") return "succeeded";
    if (job.status === "failed" || job.status === "canceled") return "failed";
  }
  return "timeout";
}
