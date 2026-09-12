import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import DashboardShell from '../layouts/DashboardShell.jsx';
import './ParticipantDashboard.css';

function ParticipantDashboard() {
  const { user } = useAuth();
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
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
  const [problemStatements, setProblemStatements] = useState([]);
  const [presentationFile, setPresentationFile] = useState(null);
  const [uploadingPresentation, setUploadingPresentation] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/teams/me`, { credentials: 'include' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Failed to load your team');
      const myTeam = body.team;
      if (myTeam) {
        setTeam(myTeam);
        setProjectTitle(myTeam.project_title || '');
        setProjectDesc(myTeam.project_description || '');
        setTechStack(myTeam.tech_stack || '');
        setGithubLink(myTeam.github_link || '');
        setDemoLink(myTeam.demo_link || '');
      }
      const announcementsResponse = await fetch(`${API_BASE}/api/announcements`, { credentials: 'include' });
      const announcementsBody = await announcementsResponse.json();
      if (!announcementsResponse.ok) throw new Error(announcementsBody?.error?.message || 'Failed to load announcements');
      setAnnouncements(announcementsBody.announcements || []);
      const [problemsResponse, submissionsResponse] = await Promise.all([
        fetch(`${API_BASE}/api/problem-statements`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/submissions/me`, { credentials: 'include' }),
      ]);
      const problemsBody = await problemsResponse.json();
      const submissionsBody = await submissionsResponse.json();
      if (problemsResponse.ok) {
        setProblemStatements(problemsBody.problemStatements || []);
        setSelectedProblemStatement((current) => current || problemsBody.problemStatements?.[0]?.id || null);
      }
      const savedSubmission = submissionsBody.submissions?.[0];
      if (submissionsResponse.ok && savedSubmission) {
        setProjectTitle(savedSubmission.title || ''); setProjectDesc(savedSubmission.description || '');
        setGithubLink(savedSubmission.repository_url || ''); setDemoLink(savedSubmission.deployed_url || '');
        setSelectedProblemStatement(savedSubmission.problem_statement_id);
      }
    } catch (error) { showMessage(error.message, 'error'); }
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
      showMessage('Team members are managed by Admin.', 'error');
    } catch (err) {
      showMessage(err.message || 'Failed to add member', 'error');
    }
    setSaving(false);
  }

  async function handleRemoveMember(id) {
    setSaving(true);
    try {
      showMessage('Team members are managed by Admin.', 'error');
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
      const response = await fetch(`${API_BASE}/api/submissions`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ problemStatementId: selectedProblemStatement, projectTitle, description: projectDesc, techStack, repositoryUrl: githubLink, deployedUrl: demoLink, status: 'submitted' }) });
      const body = await response.json(); if (!response.ok) throw new Error(body?.error?.message || 'Submission failed');
      await loadData();
      showMessage('Round 2 submitted successfully! 🎉');
    } catch (err) {
      showMessage(err.message || 'Round 2 submission failed', 'error');
    }
    setSaving(false);
  }

  async function handleSaveDraft(e) {
    e.preventDefault();
    if (!team) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/submissions`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ problemStatementId: selectedProblemStatement, projectTitle, description: projectDesc, techStack, repositoryUrl: githubLink, deployedUrl: demoLink, status: 'draft' }) });
      const body = await response.json(); if (!response.ok) throw new Error(body?.error?.message || 'Save failed');
      showMessage('Draft saved!');
    } catch (err) {
      showMessage(err.message || 'Save failed', 'error');
    }
    setSaving(false);
  }

  async function handlePresentationUpload(e) {
    e.preventDefault();
    if (!presentationFile) { showMessage('Choose a PDF, PPT, or PPTX file first.', 'error'); return; }
    setUploadingPresentation(true);
    try {
      const formData = new FormData();
      formData.append('presentation', presentationFile);
      const response = await fetch(`${API_BASE}/api/presentations`, { method: 'POST', credentials: 'include', body: formData });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Presentation upload failed');
      setPresentationFile(null);
      await loadData();
      showMessage('Round 1 uploaded successfully.');
    } catch (error) { showMessage(error.message || 'Round 1 upload failed', 'error'); }
    setUploadingPresentation(false);
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
                  <span className="dash-stat-label">Round 2</span>
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
                  {problemStatements.map((statement, index) => (
                    <article
                      className={`dash-problem-card glass-card ${selectedProblemStatement === statement.id ? 'dash-problem-card--selected' : ''}`}
                      key={statement.id}
                    >
                      <span className="dash-problem-label">Problem Statement {index + 1}</span>
                      <h3>{statement.title}</h3>
                      <p>{statement.description}</p>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => {
                          setSelectedProblemStatement(statement.id);
                          showMessage(`Problem Statement ${index + 1} selected`);
                        }}
                      >
                        {selectedProblemStatement === statement.id ? 'Selected' : 'Select'}
                      </button>
                    </article>
                  ))}
                </div>
              </div>

              {false && (
                <div className="dash-notice glass-card">
                  <h3>⚠️ Database Not Connected</h3>
                  <p>Team data is loaded securely from the BIT &amp; BUILD backend.</p>
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
                  <h3>Team registration is managed by the Admin.</h3>
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
              <h2 className="dash-title">Round 2</h2>

              {!team ? (
                <div className="dash-notice glass-card">
                  <p>Register your team first before submitting your Round 2 project.</p>
                </div>
              ) : (
                <form className="dash-form glass-card" onSubmit={handleSubmission}>
                  {team.submission_status === 'submitted' && (
                    <div className="dash-submitted-badge">✅ Round 2 Submitted</div>
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
                      {saving ? 'Submitting...' : '🚀 Submit Round 2'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {activeTab === 'presentation' && (
            <div className="dash-section">
              <h2 className="dash-title">Round 1</h2>
              {!team ? <div className="dash-notice glass-card"><p>Your team must be registered before uploading Round 1.</p></div> : (
                <form className="dash-form glass-card" onSubmit={handlePresentationUpload}>
                  <h3>{team.presentation ? 'Replace Round 1 Upload' : 'Upload Round 1'}</h3>
                  {team.presentation ? <div className="dash-submitted-badge">Round 1 Uploaded ✓<br /><span>{team.presentation.originalFilename}</span><br /><a href={`${API_BASE}/api/presentations/me/file`} target="_blank" rel="noreferrer">View Round 1</a></div> : <p className="dash-field-hint">No Round 1 upload yet.</p>}
                  <label className="dash-field"><span>PDF, PPT, or PPTX (max 20 MB)</span><input type="file" accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(e) => setPresentationFile(e.target.files?.[0] || null)} required /></label>
                  <button type="submit" className="btn btn--primary" disabled={uploadingPresentation}>{uploadingPresentation ? 'Uploading...' : team.presentation ? 'Replace Round 1 Upload' : 'Upload Round 1'}</button>
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
