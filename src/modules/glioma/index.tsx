import type { PatientModule } from '../types';
import { makeDetectFromPreset } from '../shared/detect';
import ModuleLayout from '../shared/ModuleLayout';
import PlaceholderScreen from '../shared/PlaceholderScreen';
import { GLIOMA_PRESET } from '../../components/Timeline/config';

const gliomaModule: PatientModule = {
    id:          'glioma',
    label:       'Glioma / CNS Dashboard',
    icon:        'bi-activity',
    description: 'Brain tumors, glioma, glioblastoma',
    color:       GLIOMA_PRESET.color,
    basePath:    'glioma',
    layout:      <ModuleLayout basePath="glioma" label="Glioma / CNS Dashboard" icon="bi-activity" color={GLIOMA_PRESET.color} />,
    detect:      makeDetectFromPreset(GLIOMA_PRESET),
    routes: [
        {
            index:   true,
            element: <PlaceholderScreen
                         label="Glioma / CNS Dashboard"
                         icon="bi-activity"
                         description={GLIOMA_PRESET.description}
                         color={GLIOMA_PRESET.color}
                     />,
        },
    ],
};

export default gliomaModule;
