/**
 * Ordering candidates for a human to read.
 *
 * Score first, because fit is the question being asked. Expected salary
 * breaks a tie, because between two people the system cannot tell apart,
 * the cheaper one is the better hire — and that is a judgement worth being
 * explicit about rather than leaving to whichever CV happened to arrive
 * first.
 *
 * What this is NOT is a reason to reject anybody. It decides reading
 * order. A person still decides.
 */

export interface Rankable {
  id: number;
  score: number | null;
  expectedSalary: number | null;
  receivedAt: Date;
}

/** Scores within this of each other are treated as the same fit. */
export const SCORE_TIE_BAND = 3;

/**
 * Best first.
 *
 * The tie band matters: 91 and 89 are not meaningfully different
 * judgements of the same CV, and sorting them strictly by score would let
 * two points of model noise outrank a candidate asking for half the money.
 */
export function rankCandidates<T extends Rankable>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => {
    const aScore = a.score ?? -1;
    const bScore = b.score ?? -1;

    // Unscored last: there is nothing to rank them on yet.
    if (aScore < 0 || bScore < 0) return bScore - aScore;

    if (Math.abs(aScore - bScore) > SCORE_TIE_BAND) return bScore - aScore;

    // Within the band. Somebody who told us what they want is ranked on
    // it; somebody who left it blank sorts after, because an unknown cost
    // is not a low one.
    const aSalary = a.expectedSalary;
    const bSalary = b.expectedSalary;
    if (aSalary !== null && bSalary !== null && aSalary !== bSalary) {
      return aSalary - bSalary;
    }
    if (aSalary !== null && bSalary === null) return -1;
    if (aSalary === null && bSalary !== null) return 1;

    // Nothing to choose between them: whoever applied first.
    return a.receivedAt.getTime() - b.receivedAt.getTime();
  });
}

/**
 * The shortlist HR reads first.
 *
 * Capped because a list of eighty is not a shortlist, and the point of
 * scoring was to stop somebody reading eighty CVs.
 */
export function topCandidates<T extends Rankable>(candidates: T[], limit = 15): T[] {
  return rankCandidates(candidates).slice(0, limit);
}
