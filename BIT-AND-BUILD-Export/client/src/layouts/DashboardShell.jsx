import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import BackgroundEffects from '../components/BackgroundEffects.jsx';
import './DashboardShell.css';

const NAV_ITEMS = {
  participant: [
    { id: 'overview', label: 'Overview', icon: '🏠' },
    { id: 'team', label: 'My Team', icon: '👥' },
    { id: 'submission', label: 'Submission', icon: '📦' },
    { id: 'announcements', label: 'Announcements', icon: '📢' },
  ],
  judge: [
    { id: 'overview', label: 'Overview', icon: '🏠' },
    { id: 'teams', label: 'All Teams', icon: '👥' },
    { id: 'scoring', label: 'Scoring', icon: '⚖️' },
  ],
  organizer: [
    { id: 'judges', label: 'Judges', icon: '⚖️' },
    { id: 'problems', label: 'Problems', icon: '🧩' },
    { id: 'overview', label: 'Overview', icon: '🏠' },
    { id: 'teams', label: 'All Teams', icon: '👥' },
    { id: 'entries', label: 'Submissions', icon: '📦' },
    { id: 'announcements', label: 'Announcements', icon: '📢' },
    { id: 'schedule', label: 'Schedule', icon: '📅' },
  ],
};

function DashboardShell({ role, roleLabel, activeTab, onTabChange, children }) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const navItems = NAV_ITEMS[role] || [];

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className={`dashboard-shell dashboard-shell--${role}`}>
      <BackgroundEffects variant="dashboard" />
      <aside className="dashboard-shell__sidebar">
        <div className="dashboard-shell__sidebar-top">
          <Link to="/" className="dashboard-shell__wordmark">BIT <span>&amp;</span> BUILD</Link>
          <span className={`dashboard-shell__badge dashboard-shell__badge--${role}`}>{roleLabel}</span>
        </div>
        <nav className="dashboard-shell__nav">
          {navItems.map((item) => (
            <button key={item.id} className={`dashboard-shell__nav-item ${activeTab === item.id ? 'dashboard-shell__nav-item--active' : ''}`} onClick={() => onTabChange(item.id)}>
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
