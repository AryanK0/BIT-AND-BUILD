import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Button from './Button.jsx';
import './LoginForm.css';

const ROLES = [
  { id: 'participant', label: 'Participant', path: '/participant', color: 'var(--color-participant)' },
  { id: 'judge', label: 'Judge', path: '/judge', color: 'var(--color-judge)' },
  { id: 'organizer', label: 'Organizer', path: '/organizer', color: 'var(--color-organizer)' },
];

function LoginForm() {
  const [role, setRole] = useState(ROLES[0].id);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const result = await login(email, password, role);
      if (!result.success) {
        setError(result.error);
        setLoading(false);
        return;
      }
      const destination = ROLES.find((r) => r.id === role)?.path ?? '/participant';
      navigate(destination);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    }
    setLoading(false);
  }

  const isParticipant = role === 'participant';

  return (
    <form className={`login-form login-form--${role}`} onSubmit={handleSubmit}>
      <div className="login-form__role-select" role="radiogroup" aria-label="Sign in as">
        {ROLES.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={role === r.id}
            className={`login-form__role login-form__role--${r.id} ${role === r.id ? 'login-form__role--active' : ''}`}
            onClick={() => { setRole(r.id); setError(''); setSuccess(''); }}
          >
            <span className="login-form__role-icon">
              {r.id === 'participant' ? '🕷️' : r.id === 'judge' ? '⚖️' : '🎯'}
            </span>
            {r.label}
          </button>
        ))}
      </div>

      <label className="login-form__field">
        <span className="login-form__label">{isParticipant ? 'Team Login ID' : 'Email'}</span>
        <input
          type={isParticipant ? 'text' : 'email'}
          name="identifier"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={role === 'judge' ? 'judge@bitandbuild.com' : role === 'organizer' ? 'admin@bitandbuild.com' : 'team-name-4821'}
          required
        />
      </label>

      <label className="login-form__field">
        <span className="login-form__label">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
        />
      </label>

      {error && (
        <div className="login-form__error" role="alert">
          <span className="login-form__error-icon">⚠️</span>
          {error}
        </div>
      )}

      {success && (
        <div className="login-form__success" role="status">
          <span className="login-form__success-icon">✅</span>
          {success}
        </div>
      )}

      <Button type="submit" variant="primary" loading={loading}>
        {`Log in as ${ROLES.find((r) => r.id === role)?.label}`}
      </Button>

      {isParticipant ? (
        <p className="login-form__hint">🔑 Use the team login details provided by the organizer</p>
      ) : (
        <p className="login-form__hint">
          {role === 'judge' ? '🔒 Judge credentials required' : '🔒 Organizer credentials required'}
        </p>
      )}
    </form>
  );
}

export default LoginForm;
