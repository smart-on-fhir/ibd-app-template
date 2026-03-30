import type { PatientModule } from './types';
import ibdModule         from './ibd/index.tsx';
import diabetesModule    from './diabetes/index.tsx';
import gliomaModule      from './glioma/index.tsx';
import respiratoryModule from './respiratory/index.tsx';

export const MODULE_REGISTRY: PatientModule[] = [
    ibdModule,
    diabetesModule,
    gliomaModule,
    respiratoryModule,
];
