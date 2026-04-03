import ModuleLayout   from '../shared/ModuleLayout';
import { GlobalTooltip } from './Tooltip';

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
                ]}
            />
        </>
    );
}
