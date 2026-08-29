import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DuoProvider } from "@/components/DuoProvider";
import AppShell from "@/components/AppShell";

export default async function AppLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <DuoProvider userId={user.id}>
      <AppShell>{children}</AppShell>
    </DuoProvider>
  );
}
