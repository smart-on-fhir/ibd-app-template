import { useSearchParams } from 'react-router-dom';
import episodeData   from './mockCohort.json';
import aggregateData from './mockAggregateCohort.json';

/**
 * Returns the appropriate mock cohort fixture based on the ?data=aggregate
 * URL search param. Toggle via the dev switch in the IBD sidebar.
 */
export function useCohortData() {
    const [params] = useSearchParams();
    return params.get('data') === 'aggregate'
        ? aggregateData as typeof episodeData
        : episodeData;
}
