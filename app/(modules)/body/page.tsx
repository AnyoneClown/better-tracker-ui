import BodyPage from "./body-page";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const requested = (await searchParams).period;
  const current = new Date().toISOString().slice(0, 7);
  const period = typeof requested === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : current;
  return <BodyPage initialPeriodKey={period} latestPeriodKey={current} />;
}
