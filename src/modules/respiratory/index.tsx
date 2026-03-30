import type { PatientModule } from '../types';
import { makeDetectFromPreset } from '../shared/detect';
import ModuleLayout from '../shared/ModuleLayout';
import PlaceholderScreen from '../shared/PlaceholderScreen';
import { RESPIRATORY_PRESET } from '../../components/Timeline/config';

const respiratoryModule: PatientModule = {
    id:          'respiratory',
    label:       'Respiratory Dashboard',
    icon:        'bi-lungs',
    description: 'Asthma, COPD and other respiratory conditions',
    color:       RESPIRATORY_PRESET.color,
    basePath:    'respiratory',
    layout:      <ModuleLayout basePath="respiratory" label="Respiratory Dashboard" icon="bi-lungs" color={RESPIRATORY_PRESET.color} />,
    detect:      makeDetectFromPreset(RESPIRATORY_PRESET),
    routes: [
        {
            index:   true,
            element: <PlaceholderScreen
                         label="Respiratory Dashboard"
                         icon="bi-lungs"
                         description={RESPIRATORY_PRESET.description}
                         color={RESPIRATORY_PRESET.color}
                     />,
        },
    ],
};

export default respiratoryModule;
