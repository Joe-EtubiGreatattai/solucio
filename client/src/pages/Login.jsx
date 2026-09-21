import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import Field from '../components/Field';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <main className="login-page">
    <form className="card login" onSubmit={submit}>
      <div className="login-brand"><span className="brand-mark">S</span><span>solucio</span></div>
      <div className="login-copy"><h1>Welcome back</h1><p>Sign in to manage your payments and receipts.</p></div>
      <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
      <Field label="Password"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
      <label className="row">
        <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
        <span>Show password</span>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="full-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}</button>
    </form>
    </main>
  );
}
