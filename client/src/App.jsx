import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import RequireRole from './components/RequireRole';
import Login from './pages/Login';

const Placeholder = ({ name }) => <p>{name} (coming in a later task)</p>;
const FIN = ['accountant', 'admin'];

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <p className="center">Loading…</p>;
  if (!user) return <Login />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={user.role === 'cashier' ? <Navigate to="/income" replace /> : <Placeholder name="Dashboard" />} />
        <Route path="/income" element={<Placeholder name="Income" />} />
        <Route path="/expenses" element={<RequireRole roles={FIN}><Placeholder name="Expenses" /></RequireRole>} />
        <Route path="/reports" element={<RequireRole roles={FIN}><Placeholder name="Reports" /></RequireRole>} />
        <Route path="/admin" element={<RequireRole roles={['admin']}><Placeholder name="Admin" /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
