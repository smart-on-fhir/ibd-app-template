import type { ReactElement } from 'react';
import type { FhirResource } from 'fhir/r4';

export interface ModuleRoute {
    path?:    string;
    index?:   boolean;
    element:  ReactElement;
}

export interface PatientModule {
    id:          string;
    label:       string;
    icon:        string;        // Bootstrap icon class
    description: string;
    color?:      string;        // accent color for entry card
    basePath:    string;        // e.g. 'ibd', 'diabetes'
    layout:      ReactElement;  // module layout with its own Outlet
    detect(resources: Record<string, FhirResource[]>): boolean;
    routes:      ModuleRoute[];
}
