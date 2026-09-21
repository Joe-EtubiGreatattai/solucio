import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import RequireRole from './components/RequireRole';
import Login from './pages/Login';
import Income from './pages/Income';
import Expenses from './pages/Expenses';
import Dashboard from './pages/Dashboard';
import Reports from './pages/Reports';
import Admin from './pages/Admin';

const FIN = ['accountant', 'admin'];

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <p className="center">Loading…</p>;
  if (!user) return <Login />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={user.role === 'cashier' ? <Navigate to="/income" replace /> : <Dashboard />} />
        <Route path="/income" element={<Income />} />
        <Route path="/expenses" element={<RequireRole roles={FIN}><Expenses /></RequireRole>} />
        <Route path="/reports" element={<RequireRole roles={FIN}><Reports /></RequireRole>} />
        <Route path="/admin" element={<RequireRole roles={['admin']}><Admin /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
