import { validJobId } from "./photo/jobs.ts";

export type ProfileAccount = { id: string; firstName: string; phone: string };
export type SessionLook = {
  jobId: string;
  productId: string;
  productName: string;
  brandName: string;
  completedAt: number;
};
export type AccountTicket = Readonly<{ accountId: string; revision: number }>;
type AccountResponse = { ok: boolean; status: number; json: () => Promise<unknown> };

export function parseProfileAccount(value: unknown): ProfileAccount | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const account = value as Record<string, unknown>;
  if (typeof account.id !== "string" || !/^[-a-zA-Z0-9_]{1,200}$/.test(account.id)) return null;
  return {
    id: account.id,
    firstName: typeof account.firstName === "string" ? account.firstName.trim().slice(0, 80) : "",
    // The auth endpoint returns a masked number. Never derive identity from a submitted OTP/phone.
    phone: typeof account.phone === "string" && account.phone.includes("•") ? account.phone.slice(0, 50) : "",
  };
}

/** A bounded, private-to-the-current-account process-memory index, NOT server history.
 * No image bytes, remote/signed URLs, cookies or credentials are stored here or persisted.
 * Revision tickets reject late completion/auth responses after logout or account changes.
 */
export function createTryOnSession() {
  let owner: string | null = null;
  let revision = 0;
  let looks: SessionLook[] = [];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const current = (ticket: AccountTicket | null) =>
    !!ticket && ticket.accountId === owner && ticket.revision === revision;
  const clear = () => {
    owner = null;
    looks = [];
    revision++;
    emit();
  };
  return {
    clear,
    current,
    revision: () => revision,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    bind: (accountId: string): AccountTicket => {
      if (owner !== accountId) {
        owner = accountId;
        looks = [];
        revision++;
        emit();
      }
      return Object.freeze({ accountId, revision });
    },
    read: (ticket: AccountTicket | null): readonly SessionLook[] =>
      current(ticket) ? looks.map((look) => ({ ...look })) : [],
    recordSucceeded: (ticket: AccountTicket, look: SessionLook) => {
      if (!current(ticket) || !validJobId(look.jobId) || !look.productId ||
          !Number.isFinite(look.completedAt) || look.completedAt <= 0) return false;
      if (looks.some((item) => item.jobId === look.jobId)) return false;
      // Whitelist fields: never retain arbitrary provider response data.
      looks = [{
        jobId: look.jobId,
        productId: look.productId.slice(0, 4096),
        productName: look.productName.slice(0, 200),
        brandName: look.brandName.slice(0, 120),
        completedAt: look.completedAt,
      }, ...looks].slice(0, 48);
      emit();
      return true;
    },
  };
}
export const tryOnSession = createTryOnSession();

/** The only identity source is a fresh authenticated /me read. Offline/demo data cannot unlock images. */
export async function verifyProfileAccount(
  read: () => Promise<AccountResponse>,
  active: () => boolean,
  session = tryOnSession,
): Promise<{ account: ProfileAccount; ticket: AccountTicket } | null> {
  const revision = session.revision();
  const response = await read();
  if (!active() || revision !== session.revision()) throw Error("Account check interrupted. Try again.");
  if (response.status === 401) {
    session.clear();
    return null;
  }
  if (!response.ok) throw Error("Your account could not be checked. Try again when connected.");
  const account = parseProfileAccount(await response.json());
  if (!active() || revision !== session.revision()) throw Error("Account check interrupted. Try again.");
  if (!account) throw Error("Your account could not be verified. Sign in again.");
  return { account, ticket: session.bind(account.id) };
}

export function sessionResultPath(jobId: string): string {
  if (!validJobId(jobId)) throw Error("Invalid result identifier.");
  return "/api/try-on/" + encodeURIComponent(jobId) + "/result";
}

export function profileGridColumns(width: number, fontScale = 1) {
  return width < 320 || fontScale >= 1.4 ? 1 : width >= 600 ? 3 : 2;
}
