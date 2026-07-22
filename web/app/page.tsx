import { RiskStateProvider } from "@/components/RiskStateProvider";
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Distinction } from "@/components/Distinction";
import { BorrowDemo } from "@/components/BorrowDemo";
import { LiveRiskState } from "@/components/LiveRiskState";
import { StressLab } from "@/components/StressLab";
import { HowItWorks } from "@/components/HowItWorks";
import { Integration } from "@/components/Integration";
import { TrustLimits } from "@/components/TrustLimits";
import { Footer } from "@/components/Footer";
import { DEFAULT_LST_ID } from "@/lib/constants";
import { getSnapshot, getScenarios, getScenario } from "@/lib/data";

export default function Home() {
  const snapshot = getSnapshot(DEFAULT_LST_ID)!;
  const scenarios = getScenarios();
  const steth = getScenario("steth_june_2022") ?? scenarios[0];

  return (
    <RiskStateProvider lstId={DEFAULT_LST_ID}>
      <Nav />
      <main>
        <Hero />
        <Distinction />
        <BorrowDemo snapshot={snapshot} scenario={steth} />
        <LiveRiskState />
        <StressLab scenarios={scenarios} />
        <HowItWorks />
        <Integration />
        <TrustLimits />
      </main>
      <Footer />
    </RiskStateProvider>
  );
}
