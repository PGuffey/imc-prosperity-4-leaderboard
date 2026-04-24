export type ProcessedRow = (number | string | boolean | null)[];

export interface Round {
  label: string;
  registeredTeams: number;
  rankedTeams: number;
  qualifiedCrews: number;
}

export interface ProcessedData {
  rows: ProcessedRow[];
  rounds: Round[];
}
