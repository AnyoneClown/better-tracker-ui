import NutritionPage from "./nutrition-page";

export default function Page() {
  return <NutritionPage initialPeriodKey={new Date().toISOString().slice(0, 7)} />;
}
