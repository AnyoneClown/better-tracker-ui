import MoneyPage from "./money-page";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const currentPeriod = new Date().toISOString().slice(0, 7);
  const period = typeof params.period === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.period)
    ? params.period
    : currentPeriod;
  const currency = typeof params.currency === "string" && /^[a-z]{3}$/i.test(params.currency)
    ? params.currency.toUpperCase()
    : "UAH";
  const category = typeof params.category === "string"
    ? params.category.trim().slice(0, 100) || undefined
    : undefined;
  const view = params.view === "cashflow" || params.view === "wealth" || params.view === "sources" || params.view === "overview"
    ? params.view
    : undefined;

  return <MoneyPage initialPeriodKey={period} latestPeriodKey={currentPeriod} initialCurrency={currency} initialCategory={category} initialTab={category ? "cashflow" : view} />;
}
