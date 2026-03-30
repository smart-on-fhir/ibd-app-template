import type { PatientModule } from '../types';
import { detectIBD } from './detect';
import IBDLayout from './IBDLayout';
import IBDScreenA from './ScreenA';

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
        { index: true, element: <IBDScreenA /> },
    ],
};

export default ibdModule;
