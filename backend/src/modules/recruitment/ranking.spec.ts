import { describe, expect, it } from 'vitest';
import { rankCandidates, SCORE_TIE_BAND, topCandidates } from './ranking.js';

let seq = 0;
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 0, minutes));

function candidate(score: number | null, expectedSalary: number | null, minutes = seq++) {
  return { id: minutes + 1, score, expectedSalary, receivedAt: at(minutes) };
}

const ids = (rows: { id: number }[]) => rows.map((r) => r.id);

describe('ranking', () => {
  it('puts the better fit first', () => {
    const weak = candidate(60, 100_000, 0);
    const strong = candidate(90, 300_000, 1);
    expect(ids(rankCandidates([weak, strong]))).toEqual([strong.id, weak.id]);
  });

  it('does not let salary beat a real difference in fit', () => {
    // Twenty points apart is not a tie. Cheaper does not win that.
    const cheap = candidate(70, 50_000, 0);
    const strong = candidate(90, 400_000, 1);
    expect(ids(rankCandidates([cheap, strong]))[0]).toBe(strong.id);
  });

  it('uses salary when the scores are effectively the same', () => {
    // The case from the brief: same experience, same skills, one asks for
    // less.
    const dearer = candidate(88, 250_000, 0);
    const cheaper = candidate(88, 180_000, 1);
    expect(ids(rankCandidates([dearer, cheaper]))).toEqual([cheaper.id, dearer.id]);
  });

  it('treats a couple of points as the same fit', () => {
    // 91 and 89 are model noise, not a judgement. Two points should not
    // outrank somebody asking for half the money.
    const noisyHigher = candidate(91, 400_000, 0);
    const cheaper = candidate(89, 150_000, 1);
    expect(ids(rankCandidates([noisyHigher, cheaper]))[0]).toBe(cheaper.id);
  });

  it('stops treating them as equal past the band', () => {
    const higher = candidate(90, 400_000, 0);
    const cheaper = candidate(90 - SCORE_TIE_BAND - 1, 100_000, 1);
    expect(ids(rankCandidates([higher, cheaper]))[0]).toBe(higher.id);
  });

  it('sorts somebody who gave no salary after somebody who did', () => {
    // An unknown cost is not a low one.
    const silent = candidate(88, null, 0);
    const stated = candidate(88, 300_000, 1);
    expect(ids(rankCandidates([silent, stated]))).toEqual([stated.id, silent.id]);
  });

  it('falls back to who applied first', () => {
    const first = candidate(88, 200_000, 0);
    const second = candidate(88, 200_000, 5);
    expect(ids(rankCandidates([first, second]))).toEqual([first.id, second.id]);
  });

  it('puts the unscored last whatever they expect to be paid', () => {
    const unscored = candidate(null, 10_000, 0);
    const scored = candidate(40, 900_000, 1);
    expect(ids(rankCandidates([unscored, scored]))).toEqual([scored.id, unscored.id]);
  });

  it('does not mutate what it was given', () => {
    const rows = [candidate(50, null, 0), candidate(90, null, 1)];
    const before = ids(rows);
    rankCandidates(rows);
    expect(ids(rows)).toEqual(before);
  });
});

describe('the shortlist', () => {
  it('caps at fifteen by default', () => {
    const many = Array.from({ length: 40 }, (_, i) => candidate(50 + (i % 40), null, i));
    expect(topCandidates(many)).toHaveLength(15);
  });

  it('takes the best, not the first fifteen', () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => candidate(20, null, i)),
      candidate(99, null, 99),
    ];
    expect(topCandidates(rows)[0].score).toBe(99);
  });

  it('returns everything when there are fewer than the cap', () => {
    expect(topCandidates([candidate(80, null, 0), candidate(70, null, 1)])).toHaveLength(2);
  });
});
