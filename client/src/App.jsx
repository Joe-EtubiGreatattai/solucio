import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import RequirePermission from './components/RequirePermission';
import Login from './pages/Login';
import { Skeleton } from './components/Skeleton';
import { allowsPath, visibleNav } from './nav';

// Each page is its own chunk, loaded only when its route is first visited. This keeps the initial
// download small — notably recharts, which is heavy and only the Reports page needs it.
const Income = lazy(() => import('./pages/Income'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Reports = lazy(() => import('./pages/Reports'));
const Activity = lazy(() => import('./pages/Activity'));
const StatementsLibrary = lazy(() => import('./pages/StatementsLibrary'));
const StatementReview = lazy(() => import('./pages/StatementReview'));
const Admin = lazy(() => import('./pages/Admin'));

const guard = (to, page) => <RequirePermission check={allowsPath(to)}>{page}</RequirePermission>;
const pageFallback = <div className="app-loading"><Skeleton label="Loading…" /><Skeleton /><Skeleton /></div>;

export default function App() {
  const access = useAuth();
  if (access.loading) return <div className="app-loading"><Skeleton label="Loading workspace…" /><Skeleton /><Skeleton /></div>;
  if (!access.user) return <Login />;
  const first = visibleNav(access)[0];
  return (
    <Layout>
      <Suspense fallback={pageFallback}>
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
        <Route path="/statements" element={guard('/statements', <StatementsLibrary />)} />
        <Route path="/statements/:id" element={guard('/statements', <StatementReview />)} />
        <Route path="/reports" element={guard('/reports', <Reports />)} />
        <Route path="/activity" element={guard('/activity', <Activity />)} />
        <Route path="/admin" element={guard('/admin', <Admin />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </Layout>
  );
}
