import { useState, useEffect } from 'react';
import DashboardShell from '../layouts/DashboardShell.jsx';
import { isSupabaseConfigured, fetchTeams, upsertScore } from '../lib/supabase.js';
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
  { key: 'presentation', name: 'Presentation', weight: 5 },
  { key: 'work_distribution', name: 'Work Distribution', weight: 5 },
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
    presentation: existingScore.presentation ?? 0,
    work_distribution: hasWeightedCriteria ? (existingScore.work_distribution ?? 0) : 0,
  };
}

function JudgeDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [scores, setScores] = useState(EMPTY_SCORES);
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    if (isSupabaseConfigured) {
      const data = await fetchTeams();
      setTeams(data);
    } else {
      setTeams([
        { id: '1', team_name: 'Web Warriors', leader_name: 'Miles Morales', leader_email: 'miles@uni.edu', college: 'Brooklyn Visions', project_title: 'Spider-Sense AI', project_description: 'An AI tool for accessibility.', tech_stack: 'React, Python, TensorFlow', submission_status: 'submitted', team_members: [{ member_name: 'Gwen Stacy', member_role: 'Design' }, { member_name: 'Peter B.', member_role: 'Backend' }], scores: [{ innovation: 9, technical: 8, design: 9, presentation: 7, judge_email: 'judge@bitandbuild.com' }] },
        { id: '2', team_name: 'Quantum Coders', leader_name: 'Peter Parker', leader_email: 'peter@mit.edu', college: 'MIT', project_title: 'WebShooter App', project_description: 'Real-time collaboration tool.', tech_stack: 'Vue, Firebase', submission_status: 'submitted', team_members: [{ member_name: 'MJ Watson', member_role: 'Frontend' }], scores: [] },
        { id: '3', team_name: 'Noir Devs', leader_name: 'Spider Noir', leader_email: 'noir@edu.in', college: 'Shadow U', project_title: 'Dark Mode Everything', project_description: 'Browser extension for perfect dark mode.', tech_stack: 'JavaScript, Chrome API', submission_status: 'submitted', team_members: [], scores: [] },
        { id: '4', team_name: 'Peni\'s Lab', leader_name: 'Peni Parker', leader_email: 'peni@future.edu', college: 'Neo Tokyo Tech', project_title: null, project_description: null, submission_status: 'not_submitted', team_members: [{ member_name: 'SP//dr', member_role: 'AI' }], scores: [] },
      ]);
    }
    setLoading(false);
  }

  function showMessage(text, type = 'success') {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  }

  const submittedTeams = teams.filter(t => t.submission_status === 'submitted');
  const pendingReview = submittedTeams.filter(t => !t.scores?.some(s => s.judge_email === user?.email));
  const reviewed = submittedTeams.filter(t => t.scores?.some(s => s.judge_email === user?.email));

  function selectTeamForScoring(team) {
    setSelectedTeam(team);
    const existingScore = team.scores?.find(s => s.judge_email === user?.email);
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
      if (isSupabaseConfigured) {
        await upsertScore({
          team_id: selectedTeam.id,
          judge_email: user.email,
          innovation: scores.innovation_creativity,
          technical: scores.technical_execution,
          design: scores.ui_ux,
          presentation: scores.presentation,
          ...scores,
          weighted_scores: calculateWeightedScores(scores),
          final_score: calculateFinalScore(scores),
          comments,
        });
      } else {
        setTeams(prev => prev.map(t => {
          if (t.id !== selectedTeam.id) return t;
          const existingIdx = (t.scores || []).findIndex(s => s.judge_email === user.email);
          const newScores = [...(t.scores || [])];
          const scoreObj = {
            ...scores,
            innovation: scores.innovation_creativity,
            technical: scores.technical_execution,
            design: scores.ui_ux,
            presentation: scores.presentation,
            weighted_scores: calculateWeightedScores(scores),
            final_score: calculateFinalScore(scores),
            comments,
            judge_email: user.email,
          };
          if (existingIdx >= 0) newScores[existingIdx] = scoreObj;
          else newScores.push(scoreObj);
          return { ...t, scores: newScores };
        }));
      }
      showMessage('Score submitted! ⚖️');
      if (isSupabaseConfigured) await loadData();
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
                <div className="dash-stat-card glass-card"><span className="dash-stat-icon">👥</span><span className="dash-stat-value">{teams.length}</span><span className="dash-stat-label">Total Teams</span></div>
                <div className="dash-stat-card glass-card"><span className="dash-stat-icon">📦</span><span className="dash-stat-value">{submittedTeams.length}</span><span className="dash-stat-label">Submitted</span></div>
                <div className="dash-stat-card glass-card"><span className="dash-stat-icon">✅</span><span className="dash-stat-value">{reviewed.length}</span><span className="dash-stat-label">Reviewed</span></div>
                <div className="dash-stat-card glass-card"><span className="dash-stat-icon">⏳</span><span className="dash-stat-value">{pendingReview.length}</span><span className="dash-stat-label">Pending</span></div>
              </div>
            </div>
          )}

          {activeTab === 'teams' && (
            <div className="dash-section">
              <h2 className="dash-title">All Teams & Submissions</h2>
              <div className="dash-table-wrap glass-card">
                <table className="dash-table">
                  <thead><tr><th>Team</th><th>Leader</th><th>College</th><th>Project</th><th>Status</th><th>Members</th><th>Action</th></tr></thead>
                  <tbody>
                    {teams.map(t => (
                      <tr key={t.id}>
                        <td><strong>{t.team_name}</strong></td>
                        <td>{t.leader_name}</td>
                        <td>{t.college || '—'}</td>
                        <td>{t.project_title || <em style={{color: 'var(--color-text-faint)'}}>Not submitted</em>}</td>
                        <td><span className={`dash-priority-badge ${t.submission_status === 'submitted' ? 'dash-priority-badge--normal' : 'dash-priority-badge--urgent'}`}>{t.submission_status === 'submitted' ? '✅ Submitted' : '⏳ Pending'}</span></td>
                        <td>{(t.team_members?.length || 0) + 1}</td>
                        <td>{t.submission_status === 'submitted' && <button className="btn btn--secondary" style={{padding: '0.4rem 0.8rem', fontSize: '0.8rem'}} onClick={() => selectTeamForScoring(t)}>Score</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'scoring' && (
            <div className="dash-section">
              <h2 className="dash-title">Score Team</h2>
              {!selectedTeam ? (
                <div className="dash-empty glass-card">
                  <span className="dash-empty-icon">⚖️</span>
                  <p>Select a team from the "All Teams" tab to score.</p>
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
                    <h3>Scoring Rubric (100 points)</h3>
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
                      <span>Weighted Score: <strong>{calculateFinalScore(scores).toFixed(1).replace(/\.0$/, '')} / 100</strong></span>
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
