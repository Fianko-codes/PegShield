import snapshotsJson from "@/data/snapshots.json";
import stressJson from "@/data/stress.json";
import type { OracleSnapshot, Scenario, SnapshotsFile, StressFile } from "./types";

const snapshotsFile = snapshotsJson as SnapshotsFile;
const stressFile = stressJson as unknown as StressFile;

export function getSnapshots(): OracleSnapshot[] {
  return snapshotsFile.snapshots;
}

export function getSnapshot(lstId: string): OracleSnapshot | undefined {
  return snapshotsFile.snapshots.find((s) => s.lstId === lstId);
}

export function getScenarios(): Scenario[] {
  return stressFile.scenarios;
}

export function getScenario(id: string): Scenario | undefined {
  return stressFile.scenarios.find((s) => s.id === id);
}

export function getDefaultScenario(): Scenario {
  return (
    getScenario(stressFile.defaultScenarioId) ?? stressFile.scenarios[0]
  );
}
