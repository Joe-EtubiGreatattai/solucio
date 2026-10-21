import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import { RealtimeProvider } from './realtime/RealtimeProvider.jsx';
import { ActionQueueProvider } from './queue/ActionQueueProvider.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <RealtimeProvider>
        <ActionQueueProvider>
          <App />
        </ActionQueueProvider>
      </RealtimeProvider>
    </AuthProvider>
  </BrowserRouter>
);
