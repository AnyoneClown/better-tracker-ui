import BodyPage from "./body-page";

export default function Page() {
  return <BodyPage initialPeriodKey={new Date().toISOString().slice(0, 7)} />;
}
