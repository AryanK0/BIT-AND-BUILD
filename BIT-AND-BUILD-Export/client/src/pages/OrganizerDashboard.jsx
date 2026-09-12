import { useState, useEffect } from 'react';
import DashboardShell from '../layouts/DashboardShell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import './ParticipantDashboard.css'; /* reuse shared styles */

function getScoreTotal(score) {
  const hasWeightedData = Object.keys(score.weighted_scores || {}).length > 0
    || ['completeness', 'technical_execution', 'innovation_creativity', 'applicability_scalability', 'ui_ux', 'bonus_features', 'work_distribution']
      .some(key => Number(score[key]) > 0);
  if (hasWeightedData && score.final_score !== undefined && score.final_score !== null) return Number(score.final_score);
  if (hasWeightedData && score.weighted_scores) return Object.values(score.weighted_scores).reduce((total, value) => total + Number(value), 0);
  if (hasWeightedData) {
    return (score.completeness / 10) * 20
      + (score.technical_execution / 10) * 20
      + (score.innovation_creativity / 10) * 15
      + (score.applicability_scalability / 10) * 15
      + (score.ui_ux / 10) * 10
      + (score.bonus_features / 10) * 10
      + (score.presentation / 10) * 5
      + (score.work_distribution / 10) * 5;
  }
  return (score.innovation + score.technical + score.design + score.presentation) * 2.5;
}

const SCHEDULE = [
  { time: '9:00 AM', event: 'Check-in & Registration', day: 'Day 1', status: 'upcoming' },
  { time: '10:00 AM', event: 'Opening Ceremony', day: 'Day 1', status: 'upcoming' },
  { time: '11:00 AM', event: 'Hacking Begins', day: 'Day 1', status: 'upcoming' },
  { time: '2:00 PM', event: 'Mentor Round 1', day: 'Day 1', status: 'upcoming' },
  { time: '8:00 PM', event: 'Mid-Event Check-in', day: 'Day 1', status: 'upcoming' },
  { time: '9:00 AM', event: 'Submissions Close', day: 'Day 2', status: 'upcoming' },
  { time: '10:00 AM', event: 'Demo & Judging', day: 'Day 2', status: 'upcoming' },
  { time: '12:00 PM', event: 'Awards Ceremony', day: 'Day 2', status: 'upcoming' },
];

function OrganizerDashboard() {
  const { user } = useAuth();
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const [activeTab, setActiveTab] = useState('overview');
  const [teams, setTeams] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [problemStatements, setProblemStatements] = useState([]);
  const [problemForm, setProblemForm] = useState({ id: '', title: '', description: '', isActive: true });
  const [judges, setJudges] = useState([]);
  const [judgeActivity, setJudgeActivity] = useState([]);
  const [activityJudgeFilter, setActivityJudgeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [teamForm, setTeamForm] = useState({ teamName: '', leaderName: '', leaderEmail: '', college: '' });
  const [issuedCredentials, setIssuedCredentials] = useState(null);
  const [judgePassword, setJudgePassword] = useState('');
const [generatingJudgePassword, setGeneratingJudgePassword] = useState(false);
const [judgePasswordCopied, setJudgePasswordCopied] = useState(false);

  // Announcement form
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annPriority, setAnnPriority] = useState('normal');

  // Expanded team detail
  const [expandedTeam, setExpandedTeam] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/teams`, { credentials: 'include' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Failed to load teams');
      setTeams(body.teams || []);
      const announcementsResponse = await fetch(`${API_BASE}/api/announcements`, { credentials: 'include' });
      const announcementsBody = await announcementsResponse.json();
      if (!announcementsResponse.ok) throw new Error(announcementsBody?.error?.message || 'Failed to load announcements');
      setAnnouncements(announcementsBody.announcements || []);
      const problemsResponse = await fetch(`${API_BASE}/api/problem-statements`, { credentials: 'include' });
      const problemsBody = await problemsResponse.json();
      if (!problemsResponse.ok) throw new Error(problemsBody?.error?.message || 'Failed to load problem statements');
      setProblemStatements(problemsBody.problemStatements || []);
      const judgesResponse = await fetch(`${API_BASE}/api/admin/judges`, { credentials: 'include' });
      const judgesBody = await judgesResponse.json();
      if (!judgesResponse.ok) throw new Error(judgesBody?.error?.message || 'Failed to load judges');
      setJudges(judgesBody.judges || []);
      const activityResponse = await fetch(`${API_BASE}/api/admin/judge-scoring`, { credentials: 'include' });
      const activityBody = await activityResponse.json();
      if (!activityResponse.ok) throw new Error(activityBody?.error?.message || 'Failed to load judge activity');
      setJudgeActivity(activityBody.activity || []);
    } catch (error) { showMessage(error.message, 'error'); }
    setLoading(false);
  }

  function showMessage(text, type = 'success') {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  }

  const submittedCount = teams.filter(t => t.submission_status === 'submitted').length;
  const totalMembers = teams.reduce((sum, t) => sum + (t.team_members?.length || 0) + 1, 0);
  const scoredTeams = teams.filter(t => t.scores?.length > 0);

  function createLoginName(teamName) {
    const slug = teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'team';
    return `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  function createPassword(teamName) {
    const slug = teamName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'Build';
    return `${slug}@${Math.floor(1000 + Math.random() * 9000)}`;
  }

  async function handleRegisterTeam(e) {
    e.preventDefault();
    const leaderEmail = teamForm.leaderEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leaderEmail)) {
      showMessage('Enter a valid leader email address, for example leader@university.edu.', 'error');
      return;
    }
    setSaving(true);
    const loginName = createLoginName(teamForm.teamName);
    const password = createPassword(teamForm.teamName);
    try {
      const response = await fetch(`${API_BASE}/api/teams`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamName: teamForm.teamName, leaderName: teamForm.leaderName, leaderEmail, college: teamForm.college, loginName, password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Failed to register team');
      await loadData();
      setIssuedCredentials({ teamName: teamForm.teamName, loginName, password });
      setTeamForm({ teamName: '', leaderName: '', leaderEmail: '', college: '' });
      showMessage(body.credentialEmail === 'not_sent'
        ? 'Team registered, but the credential email could not be sent. Share the credentials securely.'
        : 'Team registered. Share these credentials securely.', body.credentialEmail === 'not_sent' ? 'error' : 'success');
    } catch (err) {
      showMessage(err.message || 'Failed to register team', 'error');
    }
    setSaving(false);
  }
  async function handleGenerateJudgePassword() {
  setGeneratingJudgePassword(true);
  setJudgePassword('');
  setJudgePasswordCopied(false);

  try {
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

    const response = await fetch(`${API_BASE}/api/auth/judge/generate-password`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error?.message || 'Failed to generate Judge password');
    }

    setJudgePassword(data.password);
    showMessage('New Judge one-time password generated.');
  } catch (err) {
    showMessage(err.message || 'Failed to generate Judge password', 'error');
  } finally {
    setGeneratingJudgePassword(false);
  }
}

async function handleCopyJudgePassword() {
  if (!judgePassword) return;

  try {
    await navigator.clipboard.writeText(judgePassword);
    setJudgePasswordCopied(true);
    setTimeout(() => setJudgePasswordCopied(false), 2000);
  } catch {
    showMessage('Could not copy password', 'error');
  }
}

  async function createJudge() {
    setGeneratingJudgePassword(true); setJudgePassword(''); setJudgePasswordCopied(false);
    try {
      const response = await fetch(`${API_BASE}/api/admin/judges`, { method: 'POST', credentials: 'include' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Failed to create Judge');
      setJudgePassword(body.password);
      await loadData();
      showMessage(`${body.judge.judgeId} created. Copy the one-time password now.`);
    } catch (error) { showMessage(error.message, 'error'); }
    setGeneratingJudgePassword(false);
  }

  async function regenerateJudgePassword(judgeId) {
    setGeneratingJudgePassword(true); setJudgePassword(''); setJudgePasswordCopied(false);
    try {
      const response = await fetch(`${API_BASE}/api/admin/judges/${encodeURIComponent(judgeId)}/regenerate-password`, { method: 'POST', credentials: 'include' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Failed to regenerate password');
      setJudgePassword(body.password);
      await loadData();
      showMessage(`Password regenerated for ${body.judgeId}.`);
    } catch (error) { showMessage(error.message, 'error'); }
    setGeneratingJudgePassword(false);
  }

  async function handleDeleteTeam(team) {
    if (!window.confirm(`Delete Team? ${team.team_name} and its associated submission and scores will be removed.`)) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/teams/${team.id}`, { method: 'DELETE', credentials: 'include' });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body?.error?.message || 'Failed to delete team'); }
      if (expandedTeam?.id === team.id) setExpandedTeam(null);
      await loadData();
      showMessage('Team deleted.');
    } catch (error) { showMessage(error.message, 'error'); }
    setSaving(false);
  }

  async function handleCreateAnnouncement(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/announcements`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: annTitle, content: annContent, priority: annPriority }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Failed to post announcement');
      await loadData();
      setAnnTitle(''); setAnnContent(''); setAnnPriority('normal');
      showMessage('Announcement posted! 📢');
    } catch (err) {
      showMessage(err.message || 'Failed to post', 'error');
    }
    setSaving(false);
  }

  async function handleDeleteAnnouncement(id) {
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/announcements/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body?.error?.message || 'Failed to delete announcement'); }
      await loadData();
      showMessage('Announcement deleted');
    } catch (err) {
      showMessage(err.message || 'Failed to delete', 'error');
    }
    setSaving(false);
  }

  async function handleSaveProblem(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const method = problemForm.id ? 'PUT' : 'POST';
      const url = problemForm.id ? `${API_BASE}/api/problem-statements/${problemForm.id}` : `${API_BASE}/api/problem-statements`;
      const response = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: problemForm.title, description: problemForm.description, isActive: problemForm.isActive }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Failed to save problem statement');
      setProblemForm({ id: '', title: '', description: '', isActive: true });
      await loadData();
      showMessage('Problem statement saved.');
    } catch (error) { showMessage(error.message, 'error'); }
    setSaving(false);
  }

  async function handleDeleteProblem(id) {
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/problem-statements/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body?.error?.message || 'Failed to delete problem statement'); }
      if (problemForm.id === id) setProblemForm({ id: '', title: '', description: '', isActive: true });
      await loadData();
      showMessage('Problem statement deleted.');
    } catch (error) { showMessage(error.message, 'error'); }
    setSaving(false);
  }

  return (
    <DashboardShell role="organizer" roleLabel="Admin" activeTab={activeTab} onTabChange={setActiveTab}>
      {message.text && (
        <div className={`dash-message dash-message--${message.type}`}>{message.text}</div>
      )}
      {false && (
  <div className="dash-section">
    <div className="dash-welcome glass-card">
      <h1>Judge Access ⚖️</h1>
      <p>Generate a one-time password for the Judge account.</p>

      <div style={{
        marginTop: '24px',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.03)'
      }}>
        <p>
          <strong>Judge ID:</strong> JUDGE-001
        </p>

        <button
          type="button"
          className="btn btn--primary"
          onClick={handleGenerateJudgePassword}
          disabled={generatingJudgePassword}
        >
          {generatingJudgePassword
            ? 'Generating...'
            : '🔐 Generate One-Time Password'}
        </button>

        {judgePassword && (
          <div style={{ marginTop: '20px' }}>
            <p>
              <strong>One-Time Password:</strong>
            </p>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              <code style={{
                fontSize: '1.2rem',
                letterSpacing: '2px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(0,0,0,0.35)'
              }}>
                {judgePassword}
              </code>

              <button
                type="button"
                className="btn btn--secondary"
                onClick={handleCopyJudgePassword}
              >
                {judgePasswordCopied ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>

            <p className="dash-field-hint">
              Give this password to the Judge with ID JUDGE-001.
              It becomes invalid immediately after successful Judge login.
            </p>
          </div>
        )}
      </div>
    </div>
  </div>
)}

      {loading ? (
        <div className="dash-loading"><div className="spinner" /></div>
      ) : (
        <>
          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="dash-section">
              <div className="dash-welcome glass-card">
                <h1>ADMIN Command Center 🎯</h1>
                <p>Full oversight of teams, submissions, and event management.</p>
              </div>

              <div className="dash-stats-grid">
                <div className="dash-stat-card glass-card">
                  <span className="dash-stat-icon">👥</span>
                  <span className="dash-stat-value">{teams.length}</span>
                  <span className="dash-stat-label">Total Teams</span>
                </div>
                <div className="dash-stat-card glass-card">
                  <span className="dash-stat-icon">👤</span>
                  <span className="dash-stat-value">{totalMembers}</span>
                  <span className="dash-stat-label">Total Participants</span>
                </div>
                <div className="dash-stat-card glass-card">
                  <span className="dash-stat-icon">📦</span>
                  <span className="dash-stat-value">{submittedCount}</span>
                  <span className="dash-stat-label">Submissions</span>
                </div>
                <div className="dash-stat-card glass-card">
                  <span className="dash-stat-icon">⚖️</span>
                  <span className="dash-stat-value">{scoredTeams.length}</span>
                  <span className="dash-stat-label">Scored</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'judges' && (
            <div className="dash-section">
              <div className="dash-welcome glass-card">
                <h1>Judge Management</h1>
                <p>Create independent Judge accounts and issue one-time login passwords.</p>
                <button type="button" className="btn btn--primary" onClick={createJudge} disabled={generatingJudgePassword}>
                  {generatingJudgePassword ? 'Creating...' : 'Create Judge'}
                </button>
                {judgePassword && <div className="dash-notice" style={{ marginTop: 'var(--space-4)' }}>
                  <p><strong>One-time password:</strong> <code>{judgePassword}</code></p>
                  <button type="button" className="btn btn--secondary" onClick={handleCopyJudgePassword}>{judgePasswordCopied ? 'Copied' : 'Copy password'}</button>
                  <p className="dash-field-hint">Share this once with the Judge. It is invalidated immediately after a successful login.</p>
                </div>}
              </div>
              <div className="dash-table-wrap glass-card" style={{ marginTop: 'var(--space-4)' }}>
                <table className="dash-table"><thead><tr><th>Judge ID</th><th>Credential status</th><th>Last login</th><th>Scores submitted</th><th>Password action</th></tr></thead><tbody>
                  {judges.map((judge) => <tr key={judge.id}><td><strong>{judge.judgeId}</strong></td><td>{judge.credentialStatus === 'pending' ? 'Active — not used' : judge.credentialStatus === 'consumed' ? 'Used' : 'No credential'}</td><td>{judge.lastLoginAt ? new Date(judge.lastLoginAt).toLocaleString() : '—'}</td><td>{judge.scores?.length || 0}</td><td><button type="button" className="btn btn--secondary" disabled={generatingJudgePassword} onClick={() => regenerateJudgePassword(judge.judgeId)}>Regenerate</button></td></tr>)}
                </tbody></table>
              </div>
              <h2 className="dash-title" style={{ marginTop: 'var(--space-6)' }}>Judge Scoring Activity</h2>
              <label className="dash-field" style={{ maxWidth: '18rem' }}><span>Filter by Judge</span><select value={activityJudgeFilter} onChange={(e) => setActivityJudgeFilter(e.target.value)}><option value="">All Judges</option>{judges.map((judge) => <option key={judge.id} value={judge.judgeId}>{judge.judgeId}</option>)}</select></label>
              <div className="dash-table-wrap glass-card"><table className="dash-table"><thead><tr><th>Judge ID</th><th>Team</th><th>Score</th><th>Scored at</th></tr></thead><tbody>{judgeActivity.filter((item) => !activityJudgeFilter || item.judgeId === activityJudgeFilter).map((item) => <tr key={`${item.judgeId}-${item.teamId}`}><td>{item.judgeId}</td><td>{item.teamName}</td><td>{item.score} / 100</td><td>{new Date(item.scoredAt).toLocaleString()}</td></tr>)}</tbody></table></div>
            </div>
          )}

          {/* ALL TEAMS */}
          {activeTab === 'teams' && (
            <div className="dash-section">
              <h2 className="dash-title">All Registered Teams</h2>
              <form className="dash-form glass-card" onSubmit={handleRegisterTeam}>
                <h3>Register Team</h3>
                <div className="dash-form-grid">
                  <label className="dash-field"><span>Team Name *</span><input value={teamForm.teamName} onChange={(e) => setTeamForm({ ...teamForm, teamName: e.target.value })} placeholder="Web Warriors" required /></label>
                  <label className="dash-field"><span>Team Leader *</span><input value={teamForm.leaderName} onChange={(e) => setTeamForm({ ...teamForm, leaderName: e.target.value })} placeholder="Miles Morales" required /></label>
                  <label className="dash-field"><span>Leader Email *</span><input type="email" value={teamForm.leaderEmail} onChange={(e) => setTeamForm({ ...teamForm, leaderEmail: e.target.value })} placeholder="leader@university.edu" required /></label>
                  <label className="dash-field"><span>College</span><input value={teamForm.college} onChange={(e) => setTeamForm({ ...teamForm, college: e.target.value })} placeholder="Your College" /></label>
                </div>
                <p className="dash-field-hint">A unique team login ID and password will be generated after registration.</p>
                <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Registering...' : '🎯 Register Team'}</button>
              </form>

              {issuedCredentials && (
                <div className="dash-notice glass-card">
                  <h3>Credentials for {issuedCredentials.teamName}</h3>
                  <p>Share these once with the team. The password is not shown again.</p>
                  <p><strong>Team Login ID:</strong> {issuedCredentials.loginName}</p>
                  <p><strong>Password:</strong> {issuedCredentials.password}</p>
                  <button type="button" className="btn btn--secondary" onClick={() => setIssuedCredentials(null)}>Hide Credentials</button>
                </div>
              )}
              <div className="dash-table-wrap glass-card">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Team Name</th>
                      <th>Leader</th>
                      <th>Email</th>
                      <th>College</th>
                      <th>Members</th>
                      <th>Status</th>
                      <th>Registered</th>
                      <th>Details</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((t, i) => (
                      <tr key={t.id}>
                        <td>{i + 1}</td>
                        <td><strong>{t.team_name}</strong></td>
                        <td>{t.leader_name}</td>
                        <td style={{fontSize: 'var(--fs-micro)'}}>{t.leader_email}</td>
                        <td>{t.college || '—'}</td>
                        <td>{(t.team_members?.length || 0) + 1}</td>
                        <td>
                          <span className={`dash-priority-badge ${t.submission_status === 'submitted' ? 'dash-priority-badge--normal' : 'dash-priority-badge--urgent'}`}>
                            {t.submission_status === 'submitted' ? 'Submitted' : 'Pending'}
                          </span>
                        </td>
                        <td style={{fontSize: 'var(--fs-micro)'}}>{new Date(t.created_at).toLocaleDateString()}</td>
                        <td>
                          <button
                            className="btn btn--secondary"
                            style={{padding: '0.3rem 0.6rem', fontSize: '0.75rem'}}
                            onClick={() => setExpandedTeam(expandedTeam?.id === t.id ? null : t)}
                          >
                            {expandedTeam?.id === t.id ? 'Close' : 'View'}
                          </button>
                        </td>
                        <td><button type="button" className="btn btn--secondary" style={{padding: '0.3rem 0.6rem', fontSize: '0.75rem'}} onClick={() => handleDeleteTeam(t)} disabled={saving}>Delete</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {expandedTeam && (
                <div className="glass-card" style={{padding: 'var(--space-5)', animation: 'slide-up 0.3s ease'}}>
                  <h3>{expandedTeam.team_name} — Details</h3>
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-4)'}}>
                    <div>
                      <h4 style={{fontSize: 'var(--fs-small)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)'}}>Team Members</h4>
                      <div className="dash-team-leader" style={{marginBottom: 'var(--space-2)'}}>
                        <span className="dash-member-badge dash-member-badge--leader">Leader</span>
                        <span>{expandedTeam.leader_name} ({expandedTeam.leader_email})</span>
                      </div>
                      {expandedTeam.team_members?.map((m, i) => (
                        <div key={i} style={{padding: '0.4rem 0', fontSize: 'var(--fs-small)', color: 'var(--color-text-muted)'}}>
                          {m.member_name} {m.member_role && <span className="dash-member-role">{m.member_role}</span>} {m.member_email && <span style={{color: 'var(--color-text-faint)'}}>{m.member_email}</span>}
                        </div>
                      ))}
                    </div>
                    <div>
                      <h4 style={{fontSize: 'var(--fs-small)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)'}}>Project</h4>
                      {expandedTeam.project_title ? (
                        <>
                          <p style={{color: 'var(--color-text)', fontWeight: 600}}>{expandedTeam.project_title}</p>
                          <p style={{marginTop: '0.3rem', fontSize: 'var(--fs-small)'}}>{expandedTeam.project_description}</p>
                          {expandedTeam.tech_stack && <p style={{marginTop: '0.3rem', fontSize: 'var(--fs-small)'}}>🛠 {expandedTeam.tech_stack}</p>}
                          {expandedTeam.github_link && <p style={{marginTop: '0.3rem', fontSize: 'var(--fs-small)'}}>🔗 <a href={expandedTeam.github_link} target="_blank" rel="noreferrer" style={{color: 'var(--color-accent-blue)'}}>{expandedTeam.github_link}</a></p>}
                          {expandedTeam.demo_link && <p style={{marginTop: '0.3rem', fontSize: 'var(--fs-small)'}}>🌐 <a href={expandedTeam.demo_link} target="_blank" rel="noreferrer" style={{color: 'var(--color-accent-blue)'}}>{expandedTeam.demo_link}</a></p>}
                        </>
                      ) : (
                        <p style={{color: 'var(--color-text-faint)', fontStyle: 'italic'}}>No submission yet</p>
                      )}
                      <div style={{marginTop: 'var(--space-4)'}}><h4 style={{fontSize: 'var(--fs-small)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)'}}>Presentation</h4>{expandedTeam.presentation ? <p>{expandedTeam.presentation.originalFilename} · <a href={`${API_BASE}/api/admin/teams/${expandedTeam.id}/presentation`} target="_blank" rel="noreferrer" style={{color: 'var(--color-accent-blue)'}}>View Presentation</a></p> : <p style={{color: 'var(--color-text-faint)', fontStyle: 'italic'}}>No presentation uploaded.</p>}</div>
                    </div>
                  </div>
                  {expandedTeam.scores?.length > 0 && (
                    <div style={{marginTop: 'var(--space-4)'}}>
                      <h4 style={{fontSize: 'var(--fs-small)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)'}}>Scores</h4>
                      {expandedTeam.scores.map((s, i) => (
                        <div key={i} style={{fontSize: 'var(--fs-small)', color: 'var(--color-text-muted)', padding: '0.3rem 0'}}>
                          <p>Judge: {s.judge_email}</p>
                          <strong>Weighted Score: {getScoreTotal(s).toFixed(1).replace(/\.0$/, '')} / 100</strong>
                          <p style={{ marginTop: '0.3rem' }}>Completeness {s.completeness} · Technical Execution {s.technical_execution} · Innovation &amp; Creativity {s.innovation_creativity} · Applicability &amp; Scalability {s.applicability_scalability} · UI/UX {s.ui_ux} · Bonus Features {s.bonus_features} · Presentation {s.presentation} · Work Distribution {s.work_distribution}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ENTRIES / SUBMISSIONS */}
          {activeTab === 'entries' && (
            <div className="dash-section">
              <h2 className="dash-title">Project Submissions</h2>
              {teams.filter(t => t.submission_status === 'submitted').length === 0 ? (
                <div className="dash-empty glass-card">
                  <span className="dash-empty-icon">📦</span>
                  <p>No submissions yet.</p>
                </div>
              ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: 'var(--space-4)'}}>
                  {teams.filter(t => t.submission_status === 'submitted').map(t => (
                    <div className="glass-card" key={t.id} style={{padding: 'var(--space-5)'}}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-3)'}}>
                        <div>
                          <h3 style={{fontSize: 'var(--fs-h3)'}}>{t.project_title}</h3>
                          <p style={{fontSize: 'var(--fs-small)', marginTop: '0.3rem'}}>by <strong>{t.team_name}</strong> ({t.leader_name})</p>
                        </div>
                        {t.scores?.length > 0 && (
                          <span className="dash-submitted-badge" style={{background: 'rgba(27, 156, 252, 0.1)', borderColor: 'rgba(27, 156, 252, 0.3)', color: 'var(--color-accent-blue)'}}>
                            Scored: {(t.scores.reduce((sum, score) => sum + getScoreTotal(score), 0) / t.scores.length).toFixed(1).replace(/\.0$/, '')} / 100
                          </span>
                        )}
                      </div>
                      <p style={{marginTop: 'var(--space-3)', fontSize: 'var(--fs-small)'}}>{t.project_description}</p>
                      {t.tech_stack && <p style={{marginTop: 'var(--space-2)', fontSize: 'var(--fs-small)', color: 'var(--color-text-faint)'}}>🛠 {t.tech_stack}</p>}
                      <div style={{display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-3)', flexWrap: 'wrap'}}>
                        {t.github_link && <a href={t.github_link} target="_blank" rel="noreferrer" className="btn btn--secondary" style={{padding: '0.4rem 0.8rem', fontSize: '0.8rem'}}>🔗 GitHub</a>}
                        {t.demo_link && <a href={t.demo_link} target="_blank" rel="noreferrer" className="btn btn--secondary" style={{padding: '0.4rem 0.8rem', fontSize: '0.8rem'}}>🌐 Live Demo</a>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'problems' && (
            <div className="dash-section">
              <h2 className="dash-title">Problem Statements</h2>
              <form className="dash-form glass-card" onSubmit={handleSaveProblem}>
                <h3>{problemForm.id ? 'Edit Problem Statement' : 'Create Problem Statement'}</h3>
                <div className="dash-form-grid">
                  <label className="dash-field dash-field--full"><span>Title *</span><input required value={problemForm.title} onChange={(e) => setProblemForm({ ...problemForm, title: e.target.value })} /></label>
                  <label className="dash-field dash-field--full"><span>Description *</span><textarea required rows={4} value={problemForm.description} onChange={(e) => setProblemForm({ ...problemForm, description: e.target.value })} /></label>
                  <label className="dash-field"><span>Status</span><select value={String(problemForm.isActive)} onChange={(e) => setProblemForm({ ...problemForm, isActive: e.target.value === 'true' })}><option value="true">Active</option><option value="false">Inactive</option></select></label>
                </div>
                <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Saving...' : 'Save Problem Statement'}</button>
                {problemForm.id && <button type="button" className="btn btn--secondary" style={{ marginLeft: '0.75rem' }} onClick={() => setProblemForm({ id: '', title: '', description: '', isActive: true })}>Cancel</button>}
              </form>
              <div className="dash-announcements">
                {problemStatements.map((problem) => <div className="dash-announcement glass-card" key={problem.id}>
                  <div className="dash-announcement-header"><h3>{problem.title}</h3><div><span className="dash-priority-badge dash-priority-badge--normal">{problem.is_active ? 'active' : 'inactive'}</span><button className="dash-remove-btn" onClick={() => handleDeleteProblem(problem.id)} disabled={saving}>✕</button></div></div>
                  <p>{problem.description}</p>
                  <button type="button" className="btn btn--secondary" onClick={() => setProblemForm({ id: problem.id, title: problem.title, description: problem.description, isActive: problem.is_active })}>Edit</button>
                </div>)}
              </div>
            </div>
          )}

          {/* ANNOUNCEMENTS */}
          {activeTab === 'announcements' && (
            <div className="dash-section">
              <h2 className="dash-title">Manage Announcements</h2>

              <form className="dash-form glass-card" onSubmit={handleCreateAnnouncement}>
                <h3>Post New Announcement</h3>
                <div className="dash-form-grid">
                  <label className="dash-field">
                    <span>Title *</span>
                    <input type="text" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder="Announcement title" required />
                  </label>
                  <label className="dash-field">
                    <span>Priority</span>
                    <select value={annPriority} onChange={(e) => setAnnPriority(e.target.value)}>
                      <option value="normal">Normal</option>
                      <option value="important">Important</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </label>
                  <label className="dash-field dash-field--full">
                    <span>Content *</span>
                    <textarea value={annContent} onChange={(e) => setAnnContent(e.target.value)} placeholder="Write your announcement..." rows={3} required />
                  </label>
                </div>
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? 'Posting...' : '📢 Post Announcement'}
                </button>
              </form>

              <div className="dash-announcements">
                {announcements.map((ann) => (
                  <div className={`dash-announcement glass-card dash-announcement--${ann.priority}`} key={ann.id}>
                    <div className="dash-announcement-header">
                      <h3>{ann.title}</h3>
                      <div style={{display: 'flex', gap: 'var(--space-2)', alignItems: 'center'}}>
                        <span className={`dash-priority-badge dash-priority-badge--${ann.priority}`}>{ann.priority}</span>
                        <button className="dash-remove-btn" onClick={() => handleDeleteAnnouncement(ann.id)} disabled={saving}>✕</button>
                      </div>
                    </div>
                    <p>{ann.content}</p>
                    <span className="dash-announcement-time">{new Date(ann.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SCHEDULE */}
          {activeTab === 'schedule' && (
            <div className="dash-section">
              <h2 className="dash-title">Event Schedule</h2>
              <div className="dash-table-wrap glass-card">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Time</th>
                      <th>Event</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCHEDULE.map((s, i) => (
                      <tr key={i}>
                        <td><span className="dash-member-role">{s.day}</span></td>
                        <td style={{fontWeight: 600}}>{s.time}</td>
                        <td>{s.event}</td>
                        <td><span className="dash-priority-badge dash-priority-badge--normal">{s.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}

export default OrganizerDashboard;
