import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

function JudgeAccessCard() {
  const { apiBase } = useAuth();
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function generatePassword() {
    setLoading(true); setMessage('');
    try {
      const response = await fetch(`${apiBase}/api/auth/judge/password`, { method: 'POST', credentials: 'include' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Could not generate password');
      setAccess(body);
    } catch (error) { setMessage(error.message); }
    finally { setLoading(false); }
  }

  async function copyPassword() {
    if (!access?.password) return;
    await navigator.clipboard?.writeText(access.password);
    setMessage('Password copied. Give it to the judge securely.');
  }

  return (
    <section className="glass-card" style={{ marginBottom: '1.5rem', padding: '1.5rem', border: '1px solid rgba(255,45,149,.2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Judge Access</h2>
          <p style={{ margin: '.35rem 0 0', opacity: .75 }}>Generate a new one-time password for the next judge session.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={generatePassword} disabled={loading}>
          {loading ? 'Generating...' : '🔐 Generate Judge Password'}
        </button>
      </div>
      {access && (
        <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '12px', background: 'rgba(255,255,255,.04)' }}>
          <p><strong>Judge ID:</strong> {access.judgeId}</p>
          <p style={{ fontSize: '1.6rem', letterSpacing: '.18em', fontWeight: 800, margin: '.5rem 0' }}>{access.password}</p>
          <p style={{ opacity: .7, margin: '0 0 1rem' }}>This password has no timer. It becomes invalid immediately after a successful judge login or when you generate another one.</p>
          <button type="button" className="btn btn--secondary" onClick={copyPassword}>Copy Password</button>
        </div>
      )}
      {message && <p role="status" style={{ marginTop: '.75rem' }}>{message}</p>}
    </section>
  );
}

export default JudgeAccessCard;
