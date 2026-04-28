import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProcessedData, ProcessedRow, Round } from '../src/models';

interface Crew {
  id: string;
  name: string;
  countryCode: string;
}

interface InterplanetaryLeaderboardItem {
  position: number;
  positionChange: 'INCREASE' | 'DECREASE' | 'EQUAL';
  score: number;
  team: Crew;
}

interface CrewResultCategory {
  rank: number | null;
  score: number | null;
}

interface CrewRoundResult {
  overall: CrewResultCategory | null;
  manual: CrewResultCategory | null;
  algo: CrewResultCategory | null;
}

interface ProcessedCrew {
  id: string;
  name: string;
  country: string;
  results: (CrewRoundResult | null)[];
}

function readFile<T>(relativePath: string): T {
  const absolutePath = path.resolve(import.meta.dirname, relativePath);
  const content = fs.readFileSync(absolutePath, { encoding: 'utf-8' });
  return JSON.parse(content);
}

function writeFile(relativePath: string, content: string): void {
  const absolutePath = path.resolve(import.meta.dirname, relativePath);
  fs.writeFileSync(absolutePath, content);
}

const countryCodeFormatter = new Intl.DisplayNames(['en'], { type: 'region' });

const interplanetarySnapshots = [
  { label: 'Phase 1 Final Scores', directory: 'round2', phase: 1 },
  { label: 'Round 3', directory: 'round3', phase: 2 },
  { label: 'Round 4', directory: 'round4', phase: 2 },


];

const processedCrews: Record<string, ProcessedCrew> = {};
const processedRounds: Round[] = [];
const PHASE_2_CUTOFF = 200000;

function ensureCrew(item: InterplanetaryLeaderboardItem, roundCount: number): ProcessedCrew {
  const id = item.team.id;

  if (processedCrews[id] === undefined) {
    processedCrews[id] = {
      id,
      name: item.team.name,
      country: countryCodeFormatter.of(item.team.countryCode)?.replace('Hong Kong SAR China', 'Hong Kong') ?? item.team.countryCode,
      results: new Array(roundCount).fill(null),
    };
  }

  return processedCrews[id];
}

for (let i = 0; i < interplanetarySnapshots.length; i++) {
  const { label, directory } = interplanetarySnapshots[i];

  const overall = readFile<InterplanetaryLeaderboardItem[]>(`${directory}/overall.json`);
  const manual = readFile<InterplanetaryLeaderboardItem[]>(`${directory}/manual.json`);
  const algo = readFile<InterplanetaryLeaderboardItem[]>(`${directory}/algo.json`);

  processedRounds.push({
    label,
    registeredTeams: overall.length,
    rankedTeams: overall.length,
    qualifiedCrews: overall.filter(item => item.score >= PHASE_2_CUTOFF).length,
  });

  for (const item of overall) {
    const crew = ensureCrew(item, interplanetarySnapshots.length);

    crew.results[i] ??= {
      overall: null,
      manual: null,
      algo: null,
    };

    crew.results[i]!.overall = {
      rank: item.position,
      score: item.score,
    };
  }

  for (const [category, rows] of [
    ['manual', manual],
    ['algo', algo],
  ] as const) {
    for (const item of rows) {
      const crew = ensureCrew(item, interplanetarySnapshots.length);

      crew.results[i] ??= {
        overall: null,
        manual: null,
        algo: null,
      };

      crew.results[i]![category] = {
        rank: item.position,
        score: item.score,
      };
    }
  }
}

function getValueDeltaPair(
  results: ProcessedCrew['results'],
  round: number,
  category: keyof CrewRoundResult,
  item: keyof CrewResultCategory,
): (number | null)[] {
  const currentResult = results[round];
  if (currentResult === null) return [null, null];

  const currentCategory = currentResult[category];
  if (currentCategory === null) return [null, null];

  const currentValue = currentCategory[item];
  if (currentValue === null) return [null, null];

  if (interplanetarySnapshots[round].phase !== interplanetarySnapshots[round - 1]?.phase) {
    return [currentValue, null];
  }
  
  const previousResult = results[round - 1];
  if (previousResult === null || previousResult === undefined) return [currentValue, null];

  const previousCategory = previousResult[category];
  if (previousCategory === null) return [currentValue, null];

  const previousValue = previousCategory[item];
  if (previousValue === null) return [currentValue, null];

  const delta = item === 'rank' ? previousValue - currentValue : currentValue - previousValue;
  return [currentValue, Math.abs(delta) < 1e-6 ? 0 : delta];
}

const rows: ProcessedData['rows'] = [];

for (const crew of Object.values(processedCrews)) {
  const row: ProcessedRow = [crew.name, crew.country];

  for (let round = processedRounds.length - 1; round >= 0; round--) {
    row.push(...getValueDeltaPair(crew.results, round, 'overall', 'rank'));
    row.push(...getValueDeltaPair(crew.results, round, 'overall', 'score'));
    row.push(...getValueDeltaPair(crew.results, round, 'manual', 'score'));
    row.push(...getValueDeltaPair(crew.results, round, 'algo', 'score'));
  }

  const phaseOneFinalResult = crew.results.find((_, index) => interplanetarySnapshots[index].phase === 1);
  const qualifiedForPhase2 = (phaseOneFinalResult?.overall?.score ?? -Infinity) >= PHASE_2_CUTOFF;

  row.push(qualifiedForPhase2);

  rows.push(row);
}

const data: ProcessedData = {
  rows,
  rounds: processedRounds,
};

writeFile('processed.json', JSON.stringify(data));