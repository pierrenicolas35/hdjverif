export type DecisionNode = {
  id: string;
  text: string;
  helpText?: string;
  dgosRef?: string;
  options: DecisionOption[];
};

export type DecisionOption = {
  label: string;
  value: string;
  nextId?: string;
  terminalVerdict?: Verdict;
};

export type Verdict = {
  status: 'TAUX_PLEIN' | 'TAUX_INTERMEDIAIRE' | 'EXTERNE';
  title: string;
  reasons: string[];
};

export type EvaluationState = {
  answers: Record<string, string>;
  history: string[];
};
