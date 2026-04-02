import type { PatientModule } from '../types';
import { detectIBD } from './detect';
import IBDLayout from './IBDLayout';
import IBDScreenA from './ScreenA';
import IBDScreenB from './ScreenB';
import IBDScreenC from './ScreenC';
import IBDMedTimeline from './MedTimeline';

const ibdModule: PatientModule = {
    id:          'ibd',
    label:       'IBD Dashboard',
    icon:        'bi-clipboard2-pulse',
    description: "Crohn's disease & Ulcerative Colitis — clinical decision support",
    color:       '#e67e22',
    basePath:    'ibd',
    layout:      <IBDLayout />,
    detect:      detectIBD,
    routes: [
        { index: true,        element: <IBDScreenA /> },
        { path: 'timeline',   element: <IBDScreenB /> },
        { path: 'cohort',     element: <IBDScreenC /> },
        { path: 'meds',       element: <IBDMedTimeline /> },
    ],
};

export default ibdModule;
