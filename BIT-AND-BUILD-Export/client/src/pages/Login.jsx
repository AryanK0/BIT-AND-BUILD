import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import BackgroundEffects from '../components/BackgroundEffects.jsx';
import LoginForm from '../components/LoginForm.jsx';
import './Login.css';
import './LoginEnhancements.css';

function Login() {
  const { isAuthenticated, role } = useAuth();

  if (isAuthenticated && role) {
    return <Navigate to={`/${role}`} replace />;
  }

  return (
    <div className="login-page">
      <BackgroundEffects variant="compact" />

      <div className="login-page__panel">
        <section className="login-page__intro">
          <div className="login-page__intro-copy">
            <span className="login-page__eyebrow">
              International Hackathon
            </span>

            <h1 className="login-page__title">
              BIT <span>&amp;</span> BUILD
            </h1>
          </div>

          <div
            className="login-page__highlights"
            aria-label="Portal features"
          >
            <span>01 <small>Collaborate</small></span>
            <span>02 <small>Submit</small></span>
            <span>03 <small>Win</small></span>
          </div>
        </section>

        <section className="login-page__form-area">
          <div className="login-page__header">
            <h2>LOGIN</h2>
          </div>

          <LoginForm />

          <Link to="/" className="login-page__back">
            &larr; Back to home
          </Link>
        </section>
      </div>

      <svg
        className="login-page__web-corner"
        viewBox="0 0 200 200"
        aria-hidden="true"
      >
        <path d="M0 0 L200 0 L200 200" fill="none" stroke="rgba(255,45,149,0.1)" strokeWidth="1"/>
        <path d="M0 0 L200 200" fill="none" stroke="rgba(255,45,149,0.08)" strokeWidth="1"/>
        <path d="M0 0 L100 200" fill="none" stroke="rgba(27,156,252,0.06)" strokeWidth="1"/>
        <path d="M0 0 L200 100" fill="none" stroke="rgba(190,46,221,0.06)" strokeWidth="1"/>
        <path d="M40 0 Q80 80 0 40" fill="none" stroke="rgba(255,45,149,0.08)" strokeWidth="0.5"/>
        <path d="M80 0 Q120 120 0 80" fill="none" stroke="rgba(255,45,149,0.06)" strokeWidth="0.5"/>
        <path d="M120 0 Q160 160 0 120" fill="none" stroke="rgba(27,156,252,0.05)" strokeWidth="0.5"/>
        <path d="M160 0 Q180 180 0 160" fill="none" stroke="rgba(190,46,221,0.04)" strokeWidth="0.5"/>
      </svg>
    </div>
  );
}

export default Login;