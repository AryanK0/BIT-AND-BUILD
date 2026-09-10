import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './context/AuthContext.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import ParticipantDashboard from './pages/ParticipantDashboard.jsx';
import JudgeDashboard from './pages/JudgeDashboard.jsx';
import OrganizerDashboard from './pages/OrganizerDashboard.jsx';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/participant" element={
        <ProtectedRoute allowedRole="participant">
          <ParticipantDashboard />
        </ProtectedRoute>
      } />
      <Route path="/judge" element={
        <ProtectedRoute allowedRole="judge">
          <JudgeDashboard />
        </ProtectedRoute>
      } />
      <Route path="/organizer" element={
        <ProtectedRoute allowedRole="organizer">
          <OrganizerDashboard />
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default App;
