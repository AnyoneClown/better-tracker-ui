import DashboardPage from "@/app/dashboard-page";
import { requireAuthenticatedUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const currency = typeof params.currency === "string" && /^[a-z]{3}$/i.test(params.currency)
    ? params.currency.toUpperCase()
    : "UAH";
  const user = await requireAuthenticatedUser("/");
  return <DashboardPage user={user} initialCurrency={currency} />;
}
