// Mock-grade support-session marker (US-A2 AC 9): set when a platform admin
// opens a consented support session, read by the banner and cleared on end.
// Pure functions so both proxy (edge) and server actions can use them.

export const SUPPORT_COOKIE = "lims_support";

export type SupportSession = {
  orgId: string;
  orgName: string;
  allowAdmin: boolean;
  expiresAt: number;
};

export function encodeSupportSession(session: SupportSession): string {
  return Buffer.from(JSON.stringify(session)).toString("base64url");
}

export function decodeSupportSession(value: string | undefined): SupportSession | null {
  if (!value) return null;
  try {
    const session = JSON.parse(Buffer.from(value, "base64url").toString()) as SupportSession;
    if (!session.orgId || typeof session.expiresAt !== "number") return null;
    if (session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}
