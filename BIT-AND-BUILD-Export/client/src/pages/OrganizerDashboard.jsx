import { useState, useEffect } from 'react';
import DashboardShell from '../layouts/DashboardShell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { isSupabaseConfigured, fetchTeams, fetchAnnouncements, createAnnouncement, deleteAnnouncement, createOrganizerTeam } from '../lib/supabase.js';
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
  const [activeTab, setActiveTab] = useState('overview');
  const [teams, setTeams] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [teamForm, setTeamForm] = useState({ teamName: '', leaderName: '', leaderEmail: '', college: '' });
  const [issuedCredentials, setIssuedCredentials] = useState(null);

  // Announcement form
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annPriority, setAnnPriority] = useState('normal');

  // Expanded team detail
  const [expandedTeam, setExpandedTeam] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    if (isSupabaseConfigured) {
      const [teamsData, annsData] = await Promise.all([fetchTeams(), fetchAnnouncements()]);
      setTeams(teamsData);
      setAnnouncements(annsData);
    } else {
      // Demo data
      setTeams([
        { id: '1', team_name: 'Web Warriors', leader_name: 'Miles Morales', leader_email: 'miles@uni.edu', college: 'Brooklyn Visions', project_title: 'Spider-Sense AI', project_description: 'An AI accessibility tool that uses computer vision to detect obstacles.', tech_stack: 'React, Python, TensorFlow', github_link: 'https://github.com/miles/spider-sense', demo_link: 'https://spider-sense.vercel.app', submission_status: 'submitted', created_at: '2026-09-08T10:30:00Z', team_members: [{ id: 'm1', member_name: 'Gwen Stacy', member_role: 'Design', member_email: 'gwen@uni.edu' }, { id: 'm2', member_name: 'Peter B. Parker', member_role: 'Backend', member_email: 'peter@uni.edu' }], scores: [{ innovation: 9, technical: 8, design: 9, presentation: 7 }] },
        { id: '2', team_name: 'Quantum Coders', leader_name: 'Peter Parker', leader_email: 'peter@mit.edu', college: 'MIT', project_title: 'WebShooter App', project_description: 'Real-time collaboration and code sharing platform.', tech_stack: 'Vue, Firebase, WebRTC', github_link: 'https://github.com/peter/webshooter', submission_status: 'submitted', created_at: '2026-09-08T11:00:00Z', team_members: [{ id: 'm3', member_name: 'MJ Watson', member_role: 'Frontend', member_email: 'mj@mit.edu' }], scores: [] },
        { id: '3', team_name: 'Noir Devs', leader_name: 'Spider Noir', leader_email: 'noir@edu.in', college: 'Shadow University', project_title: 'Dark Mode Everything', project_description: 'A browser extension that creates perfect dark mode for any website.', tech_stack: 'JavaScript, Chrome API, CSS', submission_status: 'submitted', created_at: '2026-09-08T12:00:00Z', team_members: [], scores: [{ innovation: 7, technical: 8, design: 8, presentation: 6 }] },
        { id: '4', team_name: "Peni's Lab", leader_name: 'Peni Parker', leader_email: 'peni@future.edu', college: 'Neo Tokyo Tech', project_title: null, submission_status: 'not_submitted', created_at: '2026-09-08T14:00:00Z', team_members: [{ id: 'm4', member_name: 'SP//dr', member_role: 'AI' }], scores: [] },
      ]);
      setAnnouncements([
        { id: 'a1', title: 'Welcome to BIT & BUILD!', content: 'The hackathon officially begins. Good luck to all teams!', priority: 'important', created_by: 'admin@bitandbuild.com', created_at: '2026-09-08T10:00:00Z' },
        { id: 'a2', title: 'Mentor Sessions Available', content: 'Sign up for 1-on-1 mentor sessions at the help desk.', priority: 'normal', created_by: 'admin@bitandbuild.com', created_at: '2026-09-08T14:00:00Z' },
      ]);
    }
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
    setSaving(true);
    const loginName = createLoginName(teamForm.teamName);
    const password = createPassword(teamForm.teamName);
    try {
      if (isSupabaseConfigured) {
        await createOrganizerTeam({
          team_name: teamForm.teamName,
          leader_email: teamForm.leaderEmail,
          leader_name: teamForm.leaderName,
          college: teamForm.college,
        }, { loginName, password });
        await loadData();
      } else {
        const demoTeam = {
          id: 'demo-team-' + Date.now(), team_name: teamForm.teamName, leader_name: teamForm.leaderName,
          leader_email: teamForm.leaderEmail, college: teamForm.college, submission_status: 'not_submitted',
          created_at: new Date().toISOString(), team_members: [], scores: [], project_title: null,
        };
        setTeams((current) => [demoTeam, ...current]);
      }
      setIssuedCredentials({ teamName: teamForm.teamName, loginName, password });
      setTeamForm({ teamName: '', leaderName: '', leaderEmail: '', college: '' });
      showMessage('Team registered. Share these credentials securely.');
    } catch (err) {
      showMessage(err.message || 'Failed to register team', 'error');
    }
    setSaving(false);
  }

  async function handleCreateAnnouncement(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (isSupabaseConfigured) {
        await createAnnouncement({ title: annTitle, content: annContent, priority: annPriority, created_by: user.email });
        await loadData();
      } else {
        setAnnouncements(prev => [{ id: 'a' + Date.now(), title: annTitle, content: annContent, priority: annPriority, created_by: user.email, created_at: new Date().toISOString() }, ...prev]);
      }
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
      if (isSupabaseConfigured) {
        await deleteAnnouncement(id);
        await loadData();
      } else {
        setAnnouncements(prev => prev.filter(a => a.id !== id));
      }
      showMessage('Announcement deleted');
    } catch (err) {
      showMessage(err.message || 'Failed to delete', 'error');
    }
    setSaving(false);
  }

  return (
    <DashboardShell role="organizer" roleLabel="Organizer" activeTab={activeTab} onTabChange={setActiveTab}>
      {message.text && (
        <div className={`dash-message dash-message--${message.type}`}>{message.text}</div>
      )}

      {loading ? (
        <div className="dash-loading"><div className="spinner" /></div>
      ) : (
        <>
          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="dash-section">
              <div className="dash-welcome glass-card">
                <h1>Organizer Command Center 🎯</h1>
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
                      <th>Details</th>
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
                    </div>
                  </div>
                  {expandedTeam.scores?.length > 0 && (
                    <div style={{marginTop: 'var(--space-4)'}}>
                      <h4 style={{fontSize: 'var(--fs-small)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)'}}>Scores</h4>
                      {expandedTeam.scores.map((s, i) => (
                        <div key={i} style={{fontSize: 'var(--fs-small)', color: 'var(--color-text-muted)', padding: '0.3rem 0'}}>
                          <strong>Weighted Score: {getScoreTotal(s).toFixed(1).replace(/\.0$/, '')} / 100</strong>
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
