import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Button from './Button.jsx';
import './LoginForm.css';

const ROLES = [
  { id: 'participant', label: 'Participant', path: '/participant' },
  { id: 'judge', label: 'Judge', path: '/judge' },
 { id: 'organizer', label: 'Admin', path: '/organizer' },
];

function LoginForm() {
  const [role, setRole] = useState('participant');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const isParticipant = role === 'participant';
  const isJudge = role === 'judge';

  async function handleSubmit(event) {
    event.preventDefault(); setError(''); setLoading(true);
    const result = await login(identifier, password, role);
    if (!result.success) { setError(result.error); setLoading(false); return; }
    navigate(ROLES.find((r) => r.id === role)?.path || '/participant');
    setLoading(false);
  }

  return (
    <form className={`login-form login-form--${role}`} onSubmit={handleSubmit}>
      <div className="login-form__role-select" role="radiogroup" aria-label="Sign in as">
        {ROLES.map((r) => (
          <button key={r.id} type="button" role="radio" aria-checked={role === r.id}
            className={`login-form__role login-form__role--${r.id} ${role === r.id ? 'login-form__role--active' : ''}`}
            onClick={() => { setRole(r.id); setIdentifier(''); setPassword(''); setError(''); }}>
            <span className="login-form__role-icon">{r.id === 'participant' ? '🕷️' : r.id === 'judge' ? '⚖️' : '🎯'}</span>{r.label}
          </button>
        ))}
      </div>

      <label className="login-form__field">
      <span className="login-form__label">
  {isParticipant ? 'Team Login ID' : isJudge ? 'Judge ID' : 'Admin Email'}
</span>
        <input type={isJudge ? 'text' : isParticipant ? 'text' : 'email'} name="identifier" autoComplete="username"
          value={identifier} onChange={(e) => setIdentifier(e.target.value)}
          placeholder={isParticipant ? 'team-name-4821' : isJudge ? 'JUDGE-001' : 'admin@bitandbuild.com'} required />
      </label>

      <label className="login-form__field">
        <span className="login-form__label">{isJudge ? 'One-Time Password' : 'Password'}</span>
        <input type="password" name="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
      </label>

      {error && <div className="login-form__error" role="alert"><span className="login-form__error-icon">⚠️</span>{error}</div>}
      <Button type="submit" variant="primary" loading={loading}>Log in as {ROLES.find((r) => r.id === role)?.label}</Button>
      <p className="login-form__hint">
        {isParticipant ? '🔑 Use the team login details provided by the organizer' : isJudge ? '🔐 Ask the organizer for the current one-time password' : '🔒 Organizer credentials required'}
      </p>
    </form>
  );
}

export default LoginForm;
