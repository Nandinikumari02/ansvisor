import { computeAiVisibilityScore } from '@/lib/visibility-score';
import { LOW_SAMPLE_ANSWERS } from '@/lib/insights-summary';

/**
 * "Topics vs competitors" (VIS-010), as in the v2 mockup: a row per topic,
 * a column for you and each competitor on the trend, each cell the
 * Visibility score in that topic (the card's formula, over your answers in
 * the topic), and the gap to the topic's leader. Built from
 * insights_topic_competitors_daily (00137).
 */

interface Components {
  mentionAnswers: number;
  citationAnswers: number;
  sumInvPosition: number;
  positionCount: number;
}

export interface TopicCompetitors {
  topicId: string;
  name: string;
  prompts: number;
  /** Your answers in the topic: every score's denominator. */
  answers: number;
  brand: Components;
  /**
   * Live competitors named in the topic, by id; a missing one scored 0 there.
   * A plain object, as it crosses the server action boundary.
   */
  competitors: Record<string, Components>;
}

const num = (v: unknown): number => Number(v ?? 0);
const componentsOf = (r: Record<string, unknown>): Components => ({
  mentionAnswers: num(r.mention_answers),
  citationAnswers: num(r.citation_answers),
  sumInvPosition: num(r.sum_inv_position),
  positionCount: num(r.position_count),
});

/** The RPC payload, or null when the rollups behind it aren't backfilled. */
export function parseTopicCompetitors(raw: unknown): TopicCompetitors[] | null {
  const r = raw as { complete?: boolean; topics?: Record<string, unknown>[] } | null;
  if (!r || r.complete !== true) return null;
  return (r.topics ?? []).map((t) => ({
    topicId: String(t.topic_id),
    name: String(t.name ?? ''),
    prompts: num(t.prompts),
    answers: num(t.answers),
    brand: componentsOf(t),
    competitors: Object.fromEntries(
      (Array.isArray(t.competitors) ? (t.competitors as Record<string, unknown>[]) : []).map(
        (c) => [String(c.competitor_id), componentsOf(c)],
      ),
    ),
  }));
}

const score = (answers: number, c: Components | undefined) =>
  Math.round(
    (computeAiVisibilityScore({
      answers,
      mentionAnswers: c?.mentionAnswers ?? 0,
      citationAnswers: c?.citationAnswers ?? 0,
      positionFactor: c && c.positionCount > 0 ? c.sumInvPosition / c.positionCount : null,
    }) ?? 0) * 10,
  ) / 10;

export interface HeatmapRow {
  topicId: string;
  name: string;
  /** One score per column, in column order. */
  scores: number[];
  /**
   * 'lead': your score is the highest in the row; 'behind': `gap` is your
   * score minus the leader's; 'lowSample': too few answers for a gap.
   */
  status: 'lead' | 'behind' | 'lowSample';
  gap: number | null;
  /** The column leading the topic. */
  leader: string;
}

/**
 * The heat map's rows for the given columns (`'you'` and competitor ids):
 * the topics you lead first, then the ones you trail, biggest gap first,
 * then the ones with too few answers for a gap.
 */
export function topicHeatmap(topics: TopicCompetitors[], columns: string[]): HeatmapRow[] {
  const rows = topics.map((t): HeatmapRow => {
    const scores = columns.map((key) =>
      score(t.answers, key === 'you' ? t.brand : t.competitors[key]),
    );
    const you = scores[columns.indexOf('you')] ?? 0;
    const best = Math.max(...scores);
    const leader = columns[scores.indexOf(best)];
    if (t.answers < LOW_SAMPLE_ANSWERS) {
      return { topicId: t.topicId, name: t.name, scores, status: 'lowSample', gap: null, leader };
    }
    // A tie at the top is still a lead.
    return you >= best
      ? { topicId: t.topicId, name: t.name, scores, status: 'lead', gap: null, leader: 'you' }
      : {
          topicId: t.topicId,
          name: t.name,
          scores,
          status: 'behind',
          gap: Math.round((you - best) * 10) / 10,
          leader,
        };
  });

  const order = { lead: 0, behind: 1, lowSample: 2 };
  return rows.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      (a.gap ?? 0) - (b.gap ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

/** A cell's shade, light to dark, by score (the mockup's 15/25/35/45 steps). */
export function heatShade(score: number): 0 | 1 | 2 | 3 | 4 {
  if (score >= 45) return 4;
  if (score >= 35) return 3;
  if (score >= 25) return 2;
  if (score >= 15) return 1;
  return 0;
}
