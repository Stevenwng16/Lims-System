import { cookies } from "next/headers";
import { endSupportSessionAction } from "@/app/platform/actions";
import { decodeSupportSession, SUPPORT_COOKIE } from "@/lib/platform/support-session";
import { Button } from "@/components/ui/button";

// Persistent marker while a vendor support session is active (US-A2 AC 9):
// "clearly marked in the UI while active".
export async function SupportBanner() {
  const cookieStore = await cookies();
  const session = decodeSupportSession(cookieStore.get(SUPPORT_COOKIE)?.value);
  if (!session) return null;

  return (
    <div className="flex items-center justify-center gap-4 bg-primary px-4 py-2 text-sm text-primary-foreground">
      <span>
        Support session — vendor access ({session.allowAdmin ? "admin" : "read-only"}) ·{" "}
        {session.orgName}
      </span>
      <form action={endSupportSessionAction}>
        <input type="hidden" name="orgId" value={session.orgId} />
        <Button type="submit" variant="secondary" size="xs">
          End session
        </Button>
      </form>
    </div>
  );
}
