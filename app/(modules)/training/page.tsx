import TrainingPage from "./training-page";

export default function Page() {
  return <TrainingPage initialPeriodKey={new Date().toISOString().slice(0, 7)} />;
}
