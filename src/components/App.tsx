
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import PatientList                      from './PatientList';
import SiteHeader                       from './SiteHeader';
import PatientView                      from './PatientView';
import SiteFooter                       from './SiteFooter';
import PatientSummaryView               from './PatientSummary';
import ResourceView                     from './ResourceView';
import PatientTimeline                  from './Timeline/PatientTimeline';
import AIChat                           from './AIChat';
import HomePage                         from './HomePage';
import { PatientProvider }              from '../contexts/PatientContext';


export default function App() {
    return (
        <BrowserRouter>
            <PatientProvider>
                <SiteHeader />
                <main>
                    <Routes>
                        <Route path="/"           element={<HomePage />} />
                        <Route path="patients"    element={<PatientList />} />
                        <Route path="patients/:id" element={<PatientView />}>
                            <Route index element={<PatientSummaryView  />} />
                            <Route path="chat" element={<AIChat />} />
                            <Route path="timeline" element={<PatientTimeline />} />
                            <Route path=":resourceType" element={<ResourceView />} />
                        </Route>
                    </Routes>
                </main>
            </PatientProvider>
            <SiteFooter />
        </BrowserRouter>
    )
}
