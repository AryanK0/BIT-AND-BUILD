import { useState, useEffect } from 'react';
import DashboardShell from '../layouts/DashboardShell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import './ParticipantDashboard.css';
import './JudgeEnhancements.css';

const RUBRIC = [
  { key: 'completeness', name: 'Completeness', weight: 20 },
  { key: 'technical_execution', name: 'Technical Execution', weight: 20 },
  { key: 'innovation_creativity', name: 'Innovation & Creativity', weight: 15 },
  { key: 'applicability_scalability', name: 'Applicability & Scalability', weight: 15 },
  { key: 'ui_ux', name: 'UI/UX', weight: 10 },
  { key: 'bonus_features', name: 'Bonus Features', weight: 10 },
  { key: 'work_distribution', name: 'Work Distribution', weight: 10 },
];

const EMPTY_SCORES = Object.fromEntries(RUBRIC.map(({ key }) => [key, 0]));

function calculateWeightedScores(rawScores) {
  return Object.fromEntries(RUBRIC.map(({ key, weight }) => [key, (rawScores[key] / 10) * weight]));
}

function calculateFinalScore(rawScores) {
  return RUBRIC.reduce((total, { key, weight }) => total + (rawScores[key] / 10) * weight, 0);
}

function normalizeExistingScore(existingScore) {
  const hasWeightedCriteria = RUBRIC.some(({ key }) => Number(existingScore[key]) > 0)
    || Object.keys(existingScore.weighted_scores || {}).length > 0;

  return {
    ...EMPTY_SCORES,
    completeness: hasWeightedCriteria ? (existingScore.completeness ?? 0) : 0,
    technical_execution: hasWeightedCriteria ? (existingScore.technical_execution ?? 0) : (existingScore.technical ?? 0),
    innovation_creativity: hasWeightedCriteria ? (existingScore.innovation_creativity ?? 0) : (existingScore.innovation ?? 0),
    applicability_scalability: hasWeightedCriteria ? (existingScore.applicability_scalability ?? 0) : 0,
    ui_ux: hasWeightedCriteria ? (existingScore.ui_ux ?? 0) : (existingScore.design ?? 0),
    bonus_features: hasWeightedCriteria ? (existingScore.bonus_features ?? 0) : 0,
    work_distribution: hasWeightedCriteria ? (existingScore.work_distribution ?? 0) : 0,
  };
}

function PresentationScore({ presentation, apiBase, onSaved, showMessage }) {
  const [score, setScore] = useState(presentation.score ?? '');
  const [comments, setComments] = useState(presentation.comments ?? '');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const numericScore = Number(score);
    if (!Number.isInteger(numericScore) || numericScore < 0 || numericScore > 10) {
      showMessage('Presentation score must be an integer from 0 to 10.', 'error');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${apiBase}/api/judge/presentations/${presentation.team_id}/score`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score: numericScore, comments }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Failed to save presentation score');
      showMessage('Presentation evaluation saved.');
      await onSaved();
    } catch (error) { showMessage(error.message, 'error'); }
    setSaving(false);
  }

  return <form onSubmit={submit} style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', minWidth: '14rem' }}>
    <input aria-label={`Presentation score for ${presentation.team_name}`} type="number" min="0" max="10" step="1" value={score} onChange={(event) => setScore(event.target.value)} placeholder="0–10" style={{ width: '4.2rem' }} required />
    <input aria-label={`Presentation comments for ${presentation.team_name}`} value={comments} onChange={(event) => setComments(event.target.value)} placeholder="Comments" style={{ width: '7rem' }} />
    <button className="btn btn--secondary" style={{ padding: '0.4rem 0.55rem', fontSize: '0.75rem' }} disabled={saving}>{saving ? '…' : 'Save'}</button>
  </form>;
}

function JudgeDashboard() {
  const { user } = useAuth();
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const [activeTab, setActiveTab] = useState('overview');
  const [teams, setTeams] = useState([]);
  const [presentations, setPresentations] = useState([]);
  const [teamCount, setTeamCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [scores, setScores] = useState(EMPTY_SCORES);
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [response, summaryResponse, presentationsResponse] = await Promise.all([
        fetch(`${API_BASE}/api/judge/submissions`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/judge/teams-summary`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/judge/presentations`, { credentials: 'include' }),
      ]);
      const [body, summary, presentationsBody] = await Promise.all([response.json(), summaryResponse.json(), presentationsResponse.json()]);
      if (!response.ok) throw new Error(body?.error?.message || 'Failed to load teams');
      if (!summaryResponse.ok) throw new Error(summary?.error?.message || 'Failed to load team count');
      if (!presentationsResponse.ok) throw new Error(presentationsBody?.error?.message || 'Failed to load presentations');
      setTeams((body.submissions || []).map((item) => ({ ...item, id: item.team_id || item.registered_team_id, project_title: item.title, project_description: item.description, github_link: item.repository_url, demo_link: item.deployed_url, submission_status: item.status, score: item.score_id ? item : null })));
      setTeamCount(Number(summary.teamCount) || 0);
      setPresentations(presentationsBody.presentations || []);
    } catch (error) { showMessage(error.message, 'error'); }
    setLoading(false);
  }

  function showMessage(text, type = 'success') {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  }

  async function downloadPresentation(teamId, filename) {
    try {
      showMessage('Downloading presentation...', 'info');
      const response = await fetch(`${API_BASE}/api/judge/teams/${teamId}/presentation`, { credentials: 'include' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error?.message || 'Failed to download presentation');
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'presentation.pptx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  const submittedTeams = teams.filter(t => t.submission_status === 'submitted');
  const pendingReview = submittedTeams.filter(t => !t.score);
  const reviewed = submittedTeams.filter(t => t.score);

  function selectTeamForScoring(team) {
    setSelectedTeam(team);
    const existingScore = team.score;
    if (existingScore) {
      setScores(normalizeExistingScore(existingScore));
      setComments(existingScore.comments || '');
    } else {
      setScores(EMPTY_SCORES);
      setComments('');
    }
    setActiveTab('scoring');
  }

  function changeScore(key, delta) {
    setScores((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(10, prev[key] + delta)),
    }));
  }

  async function handleScore(e) {
    e.preventDefault();
    if (!selectedTeam) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/scores`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team_id: selectedTeam.id, ...scores, comments }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Failed to submit score');
      showMessage('Score submitted! ⚖️');
      await loadData();
    } catch (err) {
      showMessage(err.message || 'Failed to submit score', 'error');
    }
    setSaving(false);
  }

  return (
    <DashboardShell role="judge" roleLabel="Judge" activeTab={activeTab} onTabChange={setActiveTab}>
      {message.text && <div className={`dash-message dash-message--${message.type}`}>{message.text}</div>}
      {loading ? (
        <div className="dash-loading"><div className="spinner" /></div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <div className="dash-section">
              <div className="dash-welcome glass-card">
                <h1>Judge Panel ⚖️</h1>
                <p>Review teams, score projects, and help determine the winners.</p>
              </div>
              <div className="dash-stats-grid">
                <div className="dash-stat-card glass-card"><span className="dash-stat-icon">👥</span><span className="dash-stat-value">{teamCount}</span><span className="dash-stat-label">Total Teams</span></div>
                <div className="dash-stat-card glass-card"><span className="dash-stat-icon">📦</span><span className="dash-stat-value">{submittedTeams.length}</span><span className="dash-stat-label">Submitted</span></div>
                <div className="dash-stat-card glass-card"><span className="dash-stat-icon">✅</span><span className="dash-stat-value">{reviewed.length}</span><span className="dash-stat-label">Reviewed</span></div>
                <div className="dash-stat-card glass-card"><span className="dash-stat-icon">⏳</span><span className="dash-stat-value">{pendingReview.length}</span><span className="dash-stat-label">Pending</span></div>
              </div>
            </div>
          )}

          {activeTab === 'teams' && (
            <div className="dash-section">
              <h2 className="dash-title">Project Submissions</h2>
              <div className="dash-table-wrap glass-card">
                <table className="dash-table">
                  <thead><tr><th>Team</th><th>Leader</th><th>College</th><th>Project</th><th>Status</th><th>Members</th><th>Action</th></tr></thead>
                  <tbody>
                    {teams.slice().sort((a, b) => (a.submission_status === 'submitted' ? -1 : 1)).map(t => (
                      <tr key={t.id}>
                        <td><strong>{t.team_name}</strong></td>
                        <td>{t.leader_name}</td>
                        <td>{t.college || '—'}</td>
                        <td>{t.project_title || <em style={{color: 'var(--color-text-faint)'}}>Not submitted</em>}</td>
                        <td><span className={`dash-priority-badge ${t.submission_status === 'submitted' ? 'dash-priority-badge--normal' : 'dash-priority-badge--urgent'}`}>{t.submission_status === 'submitted' ? '✅ Submitted' : '⏳ Pending'}</span></td>
                        <td>{t.team_members?.length ? t.team_members.map((member) => member.member_name).join(', ') : `${t.member_count || 0} members`}</td>
                        <td>{t.submission_status === 'submitted' && <button className="btn btn--secondary" style={{padding: '0.4rem 0.8rem', fontSize: '0.8rem'}} onClick={() => selectTeamForScoring(t)}>Score</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'presentations' && (
            <div className="dash-section">
              <h2 className="dash-title">Presentation Submissions</h2>
              <p className="dash-field-hint">PPT files are reviewed separately from project submissions.</p>
              {presentations.length === 0 ? (
                <div className="dash-empty glass-card"><span className="dash-empty-icon">📊</span><p>No PPT submissions yet.</p></div>
              ) : (
                <div className="dash-table-wrap glass-card">
                  <table className="dash-table">
                    <thead><tr><th>Team & Members</th><th>Uploaded</th><th>PPT Status</th><th>Evaluation</th><th>Action</th></tr></thead>
                    <tbody>{presentations.map((presentation) => (
                      <tr key={presentation.team_id}>
                        <td><strong>{presentation.team_name}</strong><br /><small>{presentation.team_members?.map((member) => member.member_name).join(', ')}</small></td>
                        <td>{new Date(presentation.uploaded_at).toLocaleString()}</td>
                        <td><span className="dash-priority-badge dash-priority-badge--normal">PPT submitted</span></td>
                        <td><PresentationScore presentation={presentation} apiBase={API_BASE} onSaved={loadData} showMessage={showMessage} /></td>
                        <td><button className="btn btn--secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => downloadPresentation(presentation.team_id, presentation.original_filename)}>View / Download</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'scoring' && (
            <div className="dash-section">
              <h2 className="dash-title">Score Team</h2>
              {!selectedTeam ? (
                <div className="dash-empty glass-card">
                  <span className="dash-empty-icon">⚖️</span>
                  <p>Select a project from the "Submissions" tab to score.</p>
                  <button className="btn btn--secondary" onClick={() => setActiveTab('teams')}>Go to Teams</button>
                </div>
              ) : (
                <>
                  <div className="glass-card" style={{padding: 'var(--space-5)'}}>
                    <h3>{selectedTeam.team_name}</h3>
                    <p style={{marginTop: '0.5rem'}}><strong>Project:</strong> {selectedTeam.project_title}</p>
                    <p style={{marginTop: '0.25rem'}}>{selectedTeam.project_description}</p>
                    {selectedTeam.tech_stack && <p style={{marginTop: '0.25rem'}}><strong>Tech:</strong> {selectedTeam.tech_stack}</p>}
                    {selectedTeam.github_link && <p style={{marginTop: '0.25rem'}}>🔗 <a href={selectedTeam.github_link} target="_blank" rel="noreferrer" style={{color: 'var(--color-accent-blue)'}}>{selectedTeam.github_link}</a></p>}
                    {selectedTeam.demo_link && <p style={{marginTop: '0.25rem'}}>🌐 <a href={selectedTeam.demo_link} target="_blank" rel="noreferrer" style={{color: 'var(--color-accent-blue)'}}>{selectedTeam.demo_link}</a></p>}
                  </div>

                  <form className="dash-form glass-card" onSubmit={handleScore}>
                    <h3>Scoring</h3>
                    <div className="judge-score-list">
                      {RUBRIC.map(({ key, name }) => (
                        <div className="judge-score-row" key={key}>
                          <span className="judge-score-name"><strong>{name}</strong></span>
                          <div className="judge-score-controls">
                            <button type="button" className="judge-score-btn" onClick={() => changeScore(key, -1)} aria-label={`Decrease ${name}`}>−</button>
                            <span className="judge-score-value">{scores[key]}</span>
                            <button type="button" className="judge-score-btn" onClick={() => changeScore(key, 1)} aria-label={`Increase ${name}`}>+</button>
                          </div>
                        </div>
                      ))}
                      <label className="dash-field dash-field--full">
                        <span>Comments</span>
                        <textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Feedback for the team..." rows={3} />
                      </label>
                    </div>
                    <div className="judge-score-submit">
                      <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Submitting...' : '✅ Submit Score'}</button>
                      <span>Score: <strong>{calculateFinalScore(scores).toFixed(1).replace(/\.0$/, '')} / 100</strong></span>
                    </div>
                  </form>
                </>
              )}
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}

export default JudgeDashboard;
