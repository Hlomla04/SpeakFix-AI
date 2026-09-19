import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/app/app-shell";

/**
 * The live application (voice agent + ticket dashboard).
 * Protected: requires a valid session — otherwise send the user to /login.
 */
export default async function AppPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        preferredLanguage: user.preferredLanguage,
        role: user.role,
      }}
    />
  );
}
