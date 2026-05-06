import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import OrderForm from './components/OrderForm';
import OrderTracker from './components/OrderTracker';
import EventTimeline from './components/EventTimeline';

function Nav() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium px-3 py-2 rounded transition-colors ${
      isActive
        ? 'bg-blue-100 text-blue-700'
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
    }`;

  return (
    <nav className="border-b border-gray-200 bg-white sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-6">
        <span className="font-semibold text-gray-900 mr-4">OrderFlow</span>
        <NavLink to="/" end className={linkClass}>
          New Order
        </NavLink>
        <NavLink to="/timeline" className={linkClass}>
          Event Timeline
        </NavLink>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Nav />
        <main className="px-6 pb-16">
          <Routes>
            <Route path="/" element={<OrderForm />} />
            <Route path="/orders/:id" element={<OrderTracker />} />
            <Route path="/timeline" element={<EventTimeline />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
