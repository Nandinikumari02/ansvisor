import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import messages from '../../../messages/en.json';
import type { AuditPrevious, AuditRecommendation, AuditResult } from '@/lib/actions/audits';
import { AuditReport } from './audit-report';

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

const NOTE = 'Replace placeholders in [brackets] with your real data before publishing.';

const rec = (over: Partial<AuditRecommendation> = {}): AuditRecommendation => ({
  signalKey: 'case-study-evidence',
  label: 'Case study evidence',
  category: 'eeat',
  priority: 'medium',
  recommendation: 'Add one real customer result next to the plans.',
  draft: null,
  ...over,
});

const audit = (recommendations: AuditRecommendation[]): AuditResult => ({
  id: 'a1',
  brandId: 'b1',
  url: 'https://ansvisor.com/pricing',
  finalUrl: 'https://ansvisor.com/pricing',
  status: 'completed',
  totalScore: 0.63,
  categoryScores: {},
  signalsEvaluated: 45,
  signalsTotal: 47,
  rubricVersion: '1',
  error: null,
  createdAt: '2026-10-17T09:00:00.000Z',
  completedAt: '2026-10-17T09:01:00.000Z',
  signals: [],
  recommendations,
});

let container: HTMLDivElement;
let root: Root;

function render(recommendations: AuditRecommendation[], previous?: AuditPrevious | null) {
  act(() => {
    root.render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <AuditReport audit={{ ...audit(recommendations), previous }} />
      </NextIntlClientProvider>,
    );
  });
}

const scoreChange = () => container.querySelector('[data-testid="score-change"]')?.textContent;

const marks = () => [...container.querySelectorAll('pre mark')].map((m) => m.textContent);

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('AuditReport recommendations', () => {
  it('highlights the placeholders in a draft and says to replace them', () => {
    render([rec({ draft: '[customer name] grew AI citations by [real metric] with Growth.' })]);

    expect(container.querySelector('pre')?.textContent).toBe(
      '[customer name] grew AI citations by [real metric] with Growth.',
    );
    expect(marks()).toEqual(['[customer name]', '[real metric]']);
    expect(container.textContent).toContain(NOTE);
  });

  it('shows the code in its own block with its own copy button', () => {
    render([
      rec({
        signalKey: 'faq-schema',
        draft: 'How much is Starter? Starter costs $49 a month.',
        code: '{"@type": "FAQPage", "dateModified": "[date]", "mainEntity": ["a", "b"]}',
      }),
    ]);

    const blocks = [...container.querySelectorAll('pre')].map((p) => p.textContent);
    expect(blocks).toEqual([
      'How much is Starter? Starter costs $49 a month.',
      '{"@type": "FAQPage", "dateModified": "[date]", "mainEntity": ["a", "b"]}',
    ]);
    expect(container.querySelector('[aria-label="Copy draft"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Copy code"]')).not.toBeNull();
    // A JSON array is not a placeholder.
    expect(marks()).toEqual(['[date]']);
    expect(container.textContent).toContain(NOTE);
  });

  it('adds no note to copy without placeholders, or to an older audit without code', () => {
    render([rec({ draft: 'Ansvisor pricing: AI visibility plans for every team size' })]);

    expect(container.querySelectorAll('pre')).toHaveLength(1);
    expect(marks()).toEqual([]);
    expect(container.textContent).not.toContain(NOTE);
  });
});

describe('AuditReport score change', () => {
  const previous = (totalScore: number, createdAt = '2026-09-28T09:00:00.000Z') => ({
    id: 'a0',
    totalScore,
    createdAt,
  });

  it('shows the points gained since the previous audit, with its date', () => {
    render([], previous(0.56));
    expect(scoreChange()).toContain('+7 since Sep 28');
  });

  it('shows the points lost since the previous audit', () => {
    render([], previous(0.7));
    expect(scoreChange()).toContain('−7 since Sep 28');
  });

  it('says so when the score did not change', () => {
    render([], previous(0.63));
    expect(scoreChange()).toContain('No change since Sep 28');
  });

  it('includes the year when the previous audit is from another year', () => {
    render([], previous(0.5, '2025-12-30T09:00:00.000Z'));
    expect(scoreChange()).toContain('since Dec 30, 2025');
  });

  it('shows nothing without an earlier audit', () => {
    render([], null);
    expect(scoreChange()).toBeUndefined();
    render([]);
    expect(scoreChange()).toBeUndefined();
  });
});
