
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import PatientList                      from './PatientList';
import SiteHeader                       from './SiteHeader';
import PatientView                      from './PatientView';
import SiteFooter                       from './SiteFooter';


export default function App() {
    return (
        <BrowserRouter>
            <div className='container'>
                <SiteHeader />
                <hr />
                <Routes>
                    <Route path="/"    element={<PatientList />} />
                    <Route path="/:id" element={<PatientView />} />
                </Routes>
                <SiteFooter />
            </div>
        </BrowserRouter>
    )
}
