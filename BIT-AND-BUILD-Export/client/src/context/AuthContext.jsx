import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured, authenticateTeam } from '../lib/supabase.js';

const AuthContext = createContext(null);

// Hardcoded credentials for Judge & Organizer
const SPECIAL_CREDENTIALS = {
  judge: { email: 'judge@bitandbuild.com', password: 'judge2026' },
  organizer: { email: 'admin@bitandbuild.com', password: 'organizer2026' },
};

// Temporary local account used while Supabase is not connected.
const DEMO_TEAM_CREDENTIALS = {
  loginName: 'web-warriors-demo',
  password: 'webwarriors2026',
  teamId: 'demo-team-web-warriors',
  teamName: 'Web Warriors',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const stored = sessionStorage.getItem('bb_auth');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setUser(parsed.user);
        setRole(parsed.role);
      } catch { /* ignore */ }
    }

    // Also check Supabase session
    if (isSupabaseConfigured && supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user && !sessionStorage.getItem('bb_auth')) {
          const u = { id: session.user.id, email: session.user.email, name: session.user.user_metadata?.name || session.user.email };
          setUser(u);
          setRole('participant');
          sessionStorage.setItem('bb_auth', JSON.stringify({ user: u, role: 'participant' }));
        }
        setLoading(false);
      });

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          const currentAuth = sessionStorage.getItem('bb_auth');
          if (currentAuth) {
            const parsed = JSON.parse(currentAuth);
            if (parsed.role === 'participant') {
              const u = { id: session.user.id, email: session.user.email, name: session.user.user_metadata?.name || session.user.email };
              setUser(u);
            }
          }
        }
      });

      return () => subscription.unsubscribe();
    } else {
      setLoading(false);
    }
  }, []);

  // Login function
  const login = useCallback(async (email, password, selectedRole) => {
    // Judge / Organizer — hardcoded
    if (selectedRole === 'judge' || selectedRole === 'organizer') {
      const creds = SPECIAL_CREDENTIALS[selectedRole];
      if (email === creds.email && password === creds.password) {
        const u = { id: selectedRole, email, name: selectedRole === 'judge' ? 'Judge Panel' : 'Organizer Admin' };
        setUser(u);
        setRole(selectedRole);
        sessionStorage.setItem('bb_auth', JSON.stringify({ user: u, role: selectedRole }));
        return { success: true };
      }
      return { success: false, error: 'Invalid credentials. Check your email and password.' };
    }

    // Participant — organizer-issued team credentials
    if (isSupabaseConfigured && supabase) {
      const account = await authenticateTeam(email, password);
      if (!account) return { success: false, error: 'Invalid team credentials. Ask the organizer for your login details.' };
      const u = { id: account.team.id, email: account.loginName, name: account.team.team_name, teamId: account.team.id };
      setUser(u);
      setRole('participant');
      sessionStorage.setItem('bb_auth', JSON.stringify({ user: u, role: 'participant' }));
      return { success: true };
    }

    if (email.trim().toLowerCase() === DEMO_TEAM_CREDENTIALS.loginName && password === DEMO_TEAM_CREDENTIALS.password) {
      const u = {
        id: DEMO_TEAM_CREDENTIALS.teamId,
        email: DEMO_TEAM_CREDENTIALS.loginName,
        name: DEMO_TEAM_CREDENTIALS.teamName,
        teamId: DEMO_TEAM_CREDENTIALS.teamId,
      };
      setUser(u);
      setRole('participant');
      sessionStorage.setItem('bb_auth', JSON.stringify({ user: u, role: 'participant' }));
      return { success: true };
    }
    return { success: false, error: 'Invalid demo team credentials. Use the default credentials provided by the project.' };
  }, []);

  // Participant accounts are created by the organizer.
  const signup = useCallback(async (email, password, name) => {
    return { success: false, error: 'Participant accounts are created by the organizer.' };
  }, []);

  // Logout
  const logout = useCallback(async () => {
    if (isSupabaseConfigured && supabase && role === 'participant') {
      await supabase.auth.signOut();
    }
    setUser(null);
    setRole(null);
    sessionStorage.removeItem('bb_auth');
  }, [role]);

  const value = { user, role, loading, isAuthenticated: !!user, login, signup, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Protected Route component
export function ProtectedRoute({ children, allowedRole }) {
  const { isAuthenticated, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        navigate('/login', { replace: true });
      } else if (allowedRole && role !== allowedRole) {
        navigate('/' + role, { replace: true });
      }
    }
  }, [isAuthenticated, role, loading, allowedRole, navigate]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a1a' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated || (allowedRole && role !== allowedRole)) return null;
  return children;
}

export default AuthContext;
