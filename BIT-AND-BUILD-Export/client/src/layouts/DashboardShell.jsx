import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import BackgroundEffects from '../components/BackgroundEffects.jsx';
import './DashboardShell.css';

const NAV_ITEMS = {
  participant: [
    { id: 'overview', label: 'Overview', icon: '🏠' },
    { id: 'team', label: 'My Team', icon: '👥' },
    { id: 'presentation', label: 'Round 1', icon: '📄' },
    { id: 'submission', label: 'Round 2', icon: '📦' },
    { id: 'announcements', label: 'Announcements', icon: '📢' },
  ],
  judge: [
    { id: 'overview', label: 'Overview', icon: '🏠' },
    { id: 'teams', label: 'All Teams', icon: '👥' },
    { id: 'presentations', label: 'Presentations', icon: '📊' },
    { id: 'scoring', label: 'Scoring', icon: '⚖️' },
  ],
  organizer: [
    { id: 'judges', label: 'Judges', icon: '⚖️' },
    { id: 'problems', label: 'Problems', icon: '🧩' },
    { id: 'overview', label: 'Overview', icon: '🏠' },
    { id: 'teams', label: 'All Teams', icon: '👥' },
    { id: 'entries', label: 'Round 2', icon: '📦' },
    { id: 'announcements', label: 'Announcements', icon: '📢' },
    { id: 'schedule', label: 'Schedule', icon: '📅' },
  ],
};

function DashboardShell({ role, roleLabel, activeTab, onTabChange, children }) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const navItems = NAV_ITEMS[role] || [];
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('bit-and-build-sidebar-collapsed') === 'true');

  useEffect(() => {
    localStorage.setItem('bit-and-build-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className={`dashboard-shell dashboard-shell--${role} ${sidebarCollapsed ? 'dashboard-shell--sidebar-collapsed' : ''}`}>
      <BackgroundEffects variant="dashboard" />
      <aside className="dashboard-shell__sidebar" aria-label="Dashboard navigation">
        <div className="dashboard-shell__sidebar-top">
          <div className="dashboard-shell__brand-row">
            <Link to="/" className="dashboard-shell__wordmark" aria-label="Bit and Build home">BIT <span>&amp;</span> BUILD</Link>
            <button
              type="button"
              className="dashboard-shell__sidebar-toggle"
              onClick={() => setSidebarCollapsed(true)}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <span aria-hidden="true">‹</span>
            </button>
          </div>
          <span className={`dashboard-shell__badge dashboard-shell__badge--${role}`}>{roleLabel}</span>
        </div>
        <nav className="dashboard-shell__nav">
          {navItems.map((item) => (
            <button key={item.id} className={`dashboard-shell__nav-item ${activeTab === item.id ? 'dashboard-shell__nav-item--active' : ''}`} onClick={() => onTabChange(item.id)} title={sidebarCollapsed ? item.label : undefined}>
              <span className="dashboard-shell__nav-icon">{item.icon}</span>
              <span className="dashboard-shell__nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="dashboard-shell__sidebar-bottom">
          <div className="dashboard-shell__user-info">
            <div className="dashboard-shell__user-avatar">{user?.name?.[0]?.toUpperCase() || '?'}</div>
            <div className="dashboard-shell__user-details">
              <span className="dashboard-shell__user-name">{user?.name || 'User'}</span>
              <span className="dashboard-shell__user-email">{user?.email || ''}</span>
            </div>
          </div>
          <button className="dashboard-shell__logout" onClick={handleLogout}>🚪 Logout</button>
        </div>
      </aside>

      {sidebarCollapsed && (
        <button
          type="button"
          className="dashboard-shell__sidebar-reopen"
          onClick={() => setSidebarCollapsed(false)}
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          <span aria-hidden="true">›</span>
          <span className="dashboard-shell__sidebar-reopen-label">Menu</span>
        </button>
      )}

      <header className="dashboard-shell__mobile-header">
        <Link to="/" className="dashboard-shell__wordmark">BIT <span>&amp;</span> BUILD</Link>
        <span className={`dashboard-shell__badge dashboard-shell__badge--${role}`}>{roleLabel}</span>
      </header>

      <nav className="dashboard-shell__mobile-nav">
        {navItems.map((item) => (
          <button key={item.id} className={`dashboard-shell__mobile-tab ${activeTab === item.id ? 'dashboard-shell__mobile-tab--active' : ''}`} onClick={() => onTabChange(item.id)}>
            <span>{item.icon}</span>
            <span className="dashboard-shell__mobile-tab-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <main className="dashboard-shell__content">{children}</main>
    </div>
  );
}

export default DashboardShell;
