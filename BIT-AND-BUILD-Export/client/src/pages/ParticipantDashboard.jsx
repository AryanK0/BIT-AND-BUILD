import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import DashboardShell from '../layouts/DashboardShell.jsx';
import { isSupabaseConfigured, fetchMyTeam, updateTeam, addTeamMember, removeTeamMember, fetchAnnouncements } from '../lib/supabase.js';
import './ParticipantDashboard.css';

const PROBLEM_STATEMENTS = [
  { id: 'ps-1', label: 'Problem Statement 1', title: 'Your first challenge will appear here.', description: 'Organizer placeholder: add the first problem statement details before the hackathon begins.' },
  { id: 'ps-2', label: 'Problem Statement 2', title: 'Your second challenge will appear here.', description: 'Organizer placeholder: add the second problem statement details before the hackathon begins.' },
];

function ParticipantDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [team, setTeam] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('');

  // Submission form
  const [projectTitle, setProjectTitle] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [techStack, setTechStack] = useState('');
  const [githubLink, setGithubLink] = useState('');
  const [demoLink, setDemoLink] = useState('');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [selectedProblemStatement, setSelectedProblemStatement] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    if (isSupabaseConfigured && (user?.teamId || user?.id)) {
      const myTeam = await fetchMyTeam(user.teamId || user.id);
      if (myTeam) {
        setTeam(myTeam);
        setProjectTitle(myTeam.project_title || '');
        setProjectDesc(myTeam.project_description || '');
        setTechStack(myTeam.tech_stack || '');
        setGithubLink(myTeam.github_link || '');
        setDemoLink(myTeam.demo_link || '');
      }
      const anns = await fetchAnnouncements();
      setAnnouncements(anns);
    } else if (!isSupabaseConfigured && user?.teamId === 'demo-team-web-warriors') {
      setTeam({
        id: 'demo-team-web-warriors',
        team_name: 'Web Warriors',
        leader_name: 'Demo Team Leader',
        leader_email: 'web-warriors-demo',
        college: 'BIT & BUILD Demo Campus',
        submission_status: 'not_submitted',
        project_title: null,
        project_description: null,
        tech_stack: '',
        github_link: '',
        demo_link: '',
        team_members: [
          { id: 'demo-member-1', member_name: 'Demo Teammate', member_email: 'teammate@demo.local', member_role: 'Frontend' },
        ],
      });
      setAnnouncements([
        { id: 'demo-announcement-1', title: 'Welcome to BIT & BUILD!', content: 'Your organizer has registered this demo team. Explore the workspace and prepare your submission.', priority: 'important', created_at: new Date().toISOString() },
      ]);
    }
    setLoading(false);
  }

  function showMessage(text, type = 'success') {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  }

  async function handleAddMember(e) {
    e.preventDefault();
    if (!team) return;
    if ((team.team_members?.length || 0) >= 3) {
      showMessage('Maximum 4 members (including leader) allowed', 'error');
      return;
    }
    setSaving(true);
    try {
      await addTeamMember({
        team_id: team.id,
        member_name: memberName,
        member_email: memberEmail,
        member_role: memberRole,
      });
      setMemberName('');
      setMemberEmail('');
      setMemberRole('');
      await loadData();
      showMessage('Member added!');
    } catch (err) {
      showMessage(err.message || 'Failed to add member', 'error');
    }
    setSaving(false);
  }

  async function handleRemoveMember(id) {
    setSaving(true);
    try {
      await removeTeamMember(id);
      await loadData();
      showMessage('Member removed');
    } catch (err) {
      showMessage(err.message || 'Failed to remove', 'error');
    }
    setSaving(false);
  }

  async function handleSubmission(e) {
    e.preventDefault();
    if (!team) return;
    setSaving(true);
    try {
      await updateTeam(team.id, {
        project_title: projectTitle,
        project_description: projectDesc,
        tech_stack: techStack,
        github_link: githubLink,
        demo_link: demoLink,
        submission_status: 'submitted',
      });
      await loadData();
      showMessage('Project submitted successfully! 🎉');
    } catch (err) {
      showMessage(err.message || 'Submission failed', 'error');
    }
    setSaving(false);
  }

  async function handleSaveDraft(e) {
    e.preventDefault();
    if (!team) return;
    setSaving(true);
    try {
      await updateTeam(team.id, {
        project_title: projectTitle,
        project_description: projectDesc,
        tech_stack: techStack,
        github_link: githubLink,
        demo_link: demoLink,
      });
      showMessage('Draft saved!');
    } catch (err) {
      showMessage(err.message || 'Save failed', 'error');
    }
    setSaving(false);
  }

  return (
    <DashboardShell role="participant" roleLabel="Participant" activeTab={activeTab} onTabChange={setActiveTab}>
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
                <h1>Welcome, {user?.name || 'Hacker'}! 🕷️</h1>
                <p>Ready to build something amazing? {team ? 'Your team is registered.' : 'Your team has not been assigned yet.'}</p>
              </div>

              <div className="dash-stats-grid">
                <div className="dash-stat-card glass-card">
                  <span className="dash-stat-icon">👥</span>
                  <span className="dash-stat-value">{team ? (team.team_members?.length || 0) + 1 : 0}</span>
                  <span className="dash-stat-label">Team Members</span>
                </div>
                <div className="dash-stat-card glass-card">
                  <span className="dash-stat-icon">📦</span>
                  <span className="dash-stat-value">{team?.submission_status === 'submitted' ? '✅' : '⏳'}</span>
                  <span className="dash-stat-label">Submission</span>
                </div>
                <div className="dash-stat-card glass-card">
                  <span className="dash-stat-icon">🏆</span>
                  <span className="dash-stat-value">{team ? 'Active' : 'None'}</span>
                  <span className="dash-stat-label">Team Status</span>
                </div>
              </div>

              <div className="dash-problem-statements">
                <div>
                  <h2 className="dash-title">Choose Your Problem Statement</h2>
                  <p className="dash-field-hint">Select one challenge to work on during the hackathon.</p>
                </div>
                <div className="dash-problem-grid">
                  {PROBLEM_STATEMENTS.map((statement) => (
                    <article
                      className={`dash-problem-card glass-card ${selectedProblemStatement === statement.id ? 'dash-problem-card--selected' : ''}`}
                      key={statement.id}
                    >
                      <span className="dash-problem-label">{statement.label}</span>
                      <h3>{statement.title}</h3>
                      <p>{statement.description}</p>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => {
                          setSelectedProblemStatement(statement.id);
                          showMessage(`${statement.label} selected`);
                        }}
                      >
                        {selectedProblemStatement === statement.id ? 'Selected' : `Select ${statement.label}`}
                      </button>
                    </article>
                  ))}
                </div>
              </div>

              {!isSupabaseConfigured && (
                <div className="dash-notice glass-card">
                  <h3>⚠️ Database Not Connected</h3>
                  <p>Supabase is not configured. To enable team registration, submissions, and data persistence, add your Supabase credentials to the <code>.env</code> file.</p>
                </div>
              )}
            </div>
          )}

          {/* TEAM */}
          {activeTab === 'team' && (
            <div className="dash-section">
              <h2 className="dash-title">My Team</h2>

              {!team ? (
                <div className="dash-notice glass-card">
                  <h3>Team registration is managed by the organizer.</h3>
                  <p>Use the team login ID and password provided to your team. Your team workspace will appear here once it is registered.</p>
                </div>
              ) : (
                <>
                  <div className="dash-team-info glass-card">
                    <div className="dash-team-header">
                      <h3>{team.team_name}</h3>
                      {team.college && <span className="dash-team-college">📍 {team.college}</span>}
                    </div>
                    <div className="dash-team-leader">
                      <span className="dash-member-badge dash-member-badge--leader">Leader</span>
                      <span>{user?.name} ({user?.email})</span>
                    </div>

                    {team.team_members?.length > 0 && (
                      <div className="dash-members-list">
                        <h4>Team Members</h4>
                        {team.team_members.map((m) => (
                          <div className="dash-member-row" key={m.id}>
                            <div>
                              <strong>{m.member_name}</strong>
                              {m.member_role && <span className="dash-member-role">{m.member_role}</span>}
                              {m.member_email && <span className="dash-member-email">{m.member_email}</span>}
                            </div>
                            <button className="dash-remove-btn" onClick={() => handleRemoveMember(m.id)} disabled={saving}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {(team.team_members?.length || 0) < 3 && (
                    <form className="dash-form glass-card" onSubmit={handleAddMember}>
                      <h3>Add Team Member</h3>
                      <div className="dash-form-grid">
                        <label className="dash-field">
                          <span>Name *</span>
                          <input type="text" value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="Peter Parker" required />
                        </label>
                        <label className="dash-field">
                          <span>Email</span>
                          <input type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="peter@uni.edu" />
                        </label>
                        <label className="dash-field">
                          <span>Role</span>
                          <input type="text" value={memberRole} onChange={(e) => setMemberRole(e.target.value)} placeholder="Frontend Dev" />
                        </label>
                      </div>
                      <button type="submit" className="btn btn--primary" disabled={saving}>
                        {saving ? 'Adding...' : '➕ Add Member'}
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
          )}

          {/* SUBMISSION */}
          {activeTab === 'submission' && (
            <div className="dash-section">
              <h2 className="dash-title">Project Submission</h2>

              {!team ? (
                <div className="dash-notice glass-card">
                  <p>Register your team first before submitting a project.</p>
                </div>
              ) : (
                <form className="dash-form glass-card" onSubmit={handleSubmission}>
                  {team.submission_status === 'submitted' && (
                    <div className="dash-submitted-badge">✅ Submitted</div>
                  )}
                  <div className="dash-form-grid">
                    <label className="dash-field dash-field--full">
                      <span>Project Title *</span>
                      <input type="text" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder="Spider-Sense: AI Accessibility Tool" required />
                    </label>
                    <label className="dash-field dash-field--full">
                      <span>Description *</span>
                      <textarea value={projectDesc} onChange={(e) => setProjectDesc(e.target.value)} placeholder="Describe your project, the problem it solves, and your approach..." rows={4} required />
                    </label>
                    <label className="dash-field">
                      <span>Tech Stack</span>
                      <input type="text" value={techStack} onChange={(e) => setTechStack(e.target.value)} placeholder="React, Node.js, MongoDB" />
                    </label>
                    <label className="dash-field">
                      <span>GitHub Repository</span>
                      <input type="url" value={githubLink} onChange={(e) => setGithubLink(e.target.value)} placeholder="https://github.com/your-repo" />
                    </label>
                    <label className="dash-field dash-field--full">
                      <span>Demo Link</span>
                      <input type="url" value={demoLink} onChange={(e) => setDemoLink(e.target.value)} placeholder="https://your-demo.vercel.app" />
                    </label>
                  </div>
                  <div className="dash-form-actions">
                    <button type="button" className="btn btn--secondary" onClick={handleSaveDraft} disabled={saving}>
                      💾 Save Draft
                    </button>
                    <button type="submit" className="btn btn--primary" disabled={saving}>
                      {saving ? 'Submitting...' : '🚀 Submit Project'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ANNOUNCEMENTS */}
          {activeTab === 'announcements' && (
            <div className="dash-section">
              <h2 className="dash-title">Announcements</h2>
              {announcements.length === 0 ? (
                <div className="dash-empty glass-card">
                  <span className="dash-empty-icon">📢</span>
                  <p>No announcements yet. Check back later!</p>
                </div>
              ) : (
                <div className="dash-announcements">
                  {announcements.map((ann) => (
                    <div className={`dash-announcement glass-card dash-announcement--${ann.priority}`} key={ann.id}>
                      <div className="dash-announcement-header">
                        <h3>{ann.title}</h3>
                        <span className={`dash-priority-badge dash-priority-badge--${ann.priority}`}>{ann.priority}</span>
                      </div>
                      <p>{ann.content}</p>
                      <span className="dash-announcement-time">{new Date(ann.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}

export default ParticipantDashboard;
