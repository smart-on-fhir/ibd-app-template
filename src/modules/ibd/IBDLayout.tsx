import { useSearchParams } from 'react-router-dom';
import ModuleLayout        from '../shared/ModuleLayout';
import { GlobalTooltip }   from './Tooltip';

function CohortDataToggle() {
    const [params, setParams] = useSearchParams();
    const isAggregate = params.get('data') === 'aggregate';

    function toggle() {
        setParams(prev => {
            const next = new URLSearchParams(prev);
            if (isAggregate) next.delete('data');
            else             next.set('data', 'aggregate');
            return next;
        });
    }

    return (
        <div className="px-2 pt-3 mt-4 border-top">
            <div className="text-muted text-uppercase fw-semibold mb-1 small" style={{ letterSpacing: '0.04em' }}>
                Dev · Cohort data
            </div>
            <div className="form-check form-switch mb-0">
                <input className="form-check-input" type="checkbox" role="switch"
                       id="cohort-data-toggle" checked={isAggregate} onChange={toggle} />
                <label className="form-check-label text-muted" htmlFor="cohort-data-toggle">
                    {isAggregate ? 'Aggregate' : 'Episode-level'}
                </label>
            </div>
        </div>
    );
}

export default function IBDLayout() {
    return (
        <>
            <GlobalTooltip />
            <ModuleLayout
                basePath="ibd"
                label="IBD Dashboard"
                icon="bi-clipboard2-pulse"
                color="currentColor"
                navLinks={[
                    { path: ''        , label: 'IBD Summary'       , icon: 'bi-clipboard2-pulse opacity-75' },
                    { path: 'timeline', label: 'Timelines'         , icon: 'bi-bar-chart-steps opacity-75' },
                    { path: 'cohort'  , label: 'Similar Patients'  , icon: 'bi-people opacity-75' },
                    { path: 'meds'    , label: 'Treatment History' , icon: 'bi-list-columns-reverse opacity-75' },
                    { path: 'outcomes', label: 'Treatment Outcomes', icon: 'bi-graph-up-arrow opacity-75' },
                ]}
                sidebarFooter={<CohortDataToggle />}
            />
        </>
    );
}
