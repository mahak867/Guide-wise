// "Clean drafts left alone": of the drafts with nothing planted, how many did the checks leave alone?
// Kept free of server imports so the Results page and the API route can both use it.

export interface CleanDraftStats {
  /** Drafts in the set with no planted error. */
  clean: number;
  /** Clean drafts with no finding at the "violation" level (suggestions allowed). */
  noViolations: number;
  /** Clean drafts with no finding at all, suggestions included. */
  noFindings: number;
}

type ScoredDraft = { planted: unknown[]; extra: { level: string }[] };

export function cleanDraftStats(results: ScoredDraft[]): CleanDraftStats {
  const clean = results.filter((r) => r.planted.length === 0);
  return {
    clean: clean.length,
    noViolations: clean.filter((r) => !r.extra.some((e) => e.level === "violation")).length,
    noFindings: clean.filter((r) => r.extra.length === 0).length,
  };
}
