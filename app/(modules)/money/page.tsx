import MoneyPage from "./money-page";

export default function Page() {
  return <MoneyPage initialPeriodKey={new Date().toISOString().slice(0, 7)} />;
}
