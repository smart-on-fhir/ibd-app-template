import mockEpisode   from '../../modules/ibd/mock/cohort-episode.json';
import mockAggregate from '../../modules/ibd/mock/cohort-aggregate.json';
import type { CohortResponse } from './types';
export type { CohortResponse } from './types';

const BASE = import.meta.env.VITE_CDS_API_URL ?? '';

/**
 * Fetches the IBD cohort data for a given patient.
 * @param patientId - The ID of the patient.
 * @param tier - The data tier to fetch ('episode' or 'aggregate').
 * @returns A promise that resolves to the cohort response.
 */
export async function fetchIBDCohort(
    patientId: string,
    tier: 'episode' | 'aggregate' = 'episode',
): Promise<CohortResponse> {
    if (!BASE) {
        return (tier === 'aggregate' ? mockAggregate : mockEpisode) as CohortResponse;
    }
    const res = await fetch(`${BASE}/ibd/cohort?patient=${patientId}&tier=${tier}`);
    if (!res.ok) throw new Error(`CDS API error ${res.status}`);
    return res.json();
}
