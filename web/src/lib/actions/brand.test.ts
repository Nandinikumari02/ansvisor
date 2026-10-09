import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLANS, type Plan } from '@/config/plans';

/**
 * createBrand reports the brand limit as a value, not a throw: production
 * masks errors thrown from a server action, so a thrown limit error reached
 * the user as the generic Server Components digest message.
 */

let brandCount = 0;
let inserted: unknown[] = [];
let plan: Plan;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/guards/plan-guard', () => ({
  getOrgPlan: vi.fn(async () => plan),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => ({
      select: () => ({ eq: async () => ({ count: brandCount, error: null }) }),
      insert: (row: unknown) => {
        inserted.push({ table, row });
        return {
          select: () => ({
            single: async () => ({
              data: { id: 'b1', organization_id: 'org-1', name: 'Acme', slug: 'acme' },
              error: null,
            }),
          }),
        };
      },
    }),
  })),
}));

const { createBrand } = await import('./brand');

const input = { organizationId: 'org-1', name: 'Acme', domains: [] };
const capped = (maxBrands: number): Plan => ({
  ...PLANS.enterprise,
  limits: { ...PLANS.enterprise.limits, maxBrands },
});

describe('createBrand plan limit', () => {
  beforeEach(() => {
    inserted = [];
  });

  it('returns a readable plan_limit result and inserts nothing at the limit', async () => {
    brandCount = 5;
    plan = capped(5);

    const result = await createBrand(input);

    expect(result).toEqual({
      code: 'plan_limit',
      error: 'Your plan includes 5 brands. Upgrade your plan to add more.',
    });
    expect(inserted).toEqual([]);
  });

  it('creates the brand below the limit', async () => {
    brandCount = 4;
    plan = capped(5);

    const result = await createBrand(input);

    expect('brand' in result && result.brand.id).toBe('b1');
    expect(inserted).toHaveLength(1);
  });
});
