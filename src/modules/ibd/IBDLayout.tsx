import ModuleLayout from '../shared/ModuleLayout';

export default function IBDLayout() {
    return (
        <ModuleLayout
            basePath="ibd"
            label="IBD Dashboard"
            icon="bi-clipboard2-pulse"
            color="#e67e22"
            navLinks={[{ path: '', label: 'IBD Summary', icon: 'bi-clipboard2-pulse' }]}
        />
    );
}
