import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import RequirePermission from './components/RequirePermission';
import Login from './pages/Login';
import Income from './pages/Income';
import Expenses from './pages/Expenses';
import Dashboard from './pages/Dashboard';
import Reports from './pages/Reports';
import Activity from './pages/Activity';
import BankStatements from './pages/BankStatements';
import Admin from './pages/Admin';
import { Skeleton } from './components/Skeleton';
import { allowsPath, visibleNav } from './nav';

const guard = (to, page) => <RequirePermission check={allowsPath(to)}>{page}</RequirePermission>;

export default function App() {
  const access = useAuth();
  if (access.loading) return <div className="app-loading"><Skeleton label="Loading workspace…" /><Skeleton /><Skeleton /></div>;
  if (!access.user) return <Login />;
  const first = visibleNav(access)[0];
  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={
            !first ? <p className="error">Your role does not give you access to anything yet. Ask an admin to update it.</p>
              : first.to === '/' ? <Dashboard /> : <Navigate to={first.to} replace />
          }
        />
        <Route path="/income" element={guard('/income', <Income />)} />
        <Route path="/expenses" element={guard('/expenses', <Expenses />)} />
        <Route path="/statements" element={guard('/statements', <BankStatements />)} />
        <Route path="/reports" element={guard('/reports', <Reports />)} />
        <Route path="/activity" element={guard('/activity', <Activity />)} />
        <Route path="/admin" element={guard('/admin', <Admin />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
