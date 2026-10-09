/**
 * Content opportunity generation processor.
 * Moves the LLM-based generation out of the HTTP request path.
 */

import logger from '../lib/logger.js';
import { generateContentOpportunities } from '../lib/opportunity-generator.js';
import { refreshPromptClusters } from '../lib/prompt-clusters.js';

/**
 * The Generate button runs the same per-cluster generation as the nightly
 * run. Clusters are refreshed first: a brand whose prompts changed since its
 * last tracking cycle, or that has never been clustered, would otherwise get
 * nothing or work from stale groups. The button adds to the existing list
 * (#63); a cluster that already has an opportunity is skipped.
 *
 * @param {{ brandId: string, model?: string, job: { progress: function } }} opts
 */
export async function processContentJob({ brandId, model, job }) {
  job.progress({ phase: 'collecting_data', message: 'Grouping prompts into clusters...' });
  try {
    await refreshPromptClusters(brandId);
  } catch (err) {
    logger.error({ err, brandId }, 'prompt cluster refresh failed before generation');
  }

  const result = await generateContentOpportunities(brandId, {
    model,
    onProgress: (p) => job.progress(p),
  });
  logger.info({ brandId, ...result }, 'content opportunities generated');
  return result;
}
