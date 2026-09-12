import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext(null);
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || 'Request failed');
  return body;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/auth/me')
      .then((data) => {
        setUser(data.user);
        setRole(data.user?.role);
      })
      .catch(() => { setUser(null); setRole(null); })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (identifier, password, selectedRole) => {
    try {
      if (selectedRole === 'judge') {
        const data = await api('/api/auth/judge/login', {
          method: 'POST',
          body: JSON.stringify({ judgeId: identifier, password }),
        });
      setUser(data.user);
setRole(data.user?.role || data.role);
return { success: true };
      }

      if (selectedRole === 'organizer') {
        const data = await api('/api/auth/organizer/login', {
          method: 'POST',
          body: JSON.stringify({ email: identifier, password }),
        });
setUser(data.user);
setRole(data.user?.role || data.role);
return { success: true };
      }

      if (selectedRole === 'participant') {
        const data = await api('/api/auth/participant/login', {
          method: 'POST', body: JSON.stringify({ identifier, password }),
        });
        const u = data.user;
        setUser(u); setRole(u.role);
        return { success: true };
      }

      return { success: false, error: 'Unsupported login role.' };
    } catch (error) {
      return { success: false, error: error.message || 'Login failed' };
    }
  }, []);

  const signup = useCallback(async () => ({ success: false, error: 'Participant accounts are created by the Admin.' }), []);

  const logout = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* local cleanup still happens */ }
    setUser(null); setRole(null);
  }, [role]);

  const value = { user, role, loading, isAuthenticated: !!user, login, signup, logout, apiBase: API_BASE };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function ProtectedRoute({ children, allowedRole }) {
  const { isAuthenticated, role, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) navigate('/login', { replace: true });
      else if (allowedRole && role !== allowedRole) navigate('/' + role, { replace: true });
    }
  }, [isAuthenticated, role, loading, allowedRole, navigate]);
  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a1a' }}><div className="spinner" /></div>;
  if (!isAuthenticated || (allowedRole && role !== allowedRole)) return null;
  return children;
}

export default AuthContext;
