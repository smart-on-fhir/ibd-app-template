import type { PatientModule } from '../types';
import { makeDetectFromPreset } from '../shared/detect';
import ModuleLayout from '../shared/ModuleLayout';
import PlaceholderScreen from '../shared/PlaceholderScreen';
import { DIABETES_PRESET } from '../../components/Timeline/config';

const diabetesModule: PatientModule = {
    id:          'diabetes',
    label:       'Diabetes Dashboard',
    icon:        'bi-droplet',
    description: 'Type 1 & Type 2 diabetes mellitus',
    color:       DIABETES_PRESET.color,
    basePath:    'diabetes',
    layout:      <ModuleLayout basePath="diabetes" label="Diabetes Dashboard" icon="bi-droplet" color={DIABETES_PRESET.color} />,
    detect:      makeDetectFromPreset(DIABETES_PRESET),
    routes: [
        {
            index:   true,
            element: <PlaceholderScreen
                         label="Diabetes Dashboard"
                         icon="bi-droplet"
                         description={DIABETES_PRESET.description}
                         color={DIABETES_PRESET.color}
                     />,
        },
    ],
};

export default diabetesModule;
