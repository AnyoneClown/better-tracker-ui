import DashboardPage from "@/app/dashboard-page";
import { requireAuthenticatedUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireAuthenticatedUser("/");
  return <DashboardPage user={user} />;
}
