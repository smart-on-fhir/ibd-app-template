import { useFhirModal } from './FhirResourceModal';

export function FhirResourceLink({ resourceType, id, label }: {
    resourceType: string;
    id: string;
    label: string;
}) {
    const openModal = useFhirModal();

    return (
        <a
            href={`fhir:${resourceType}/${id}`}
            className="fhir-resource-link"
            title={`Open ${resourceType}/${id}`}
            onClick={(e) => { e.preventDefault(); openModal({ resourceType, id, label }); }}
        >
            <i className="bi bi-file-earmark-text" style={{ fontSize: '0.85em', marginRight: '0.2em' }} />
            {label}
        </a>
    );
}
