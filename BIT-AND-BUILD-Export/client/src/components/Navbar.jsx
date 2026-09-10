import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PageContainer from './PageContainer.jsx';
import Button from './Button.jsx';
import './Navbar.css';

function Navbar() {
  const { isAuthenticated, role } = useAuth();

  return (
    <header className="navbar">
      <PageContainer className="navbar__inner">
        <Link to="/" className="navbar__wordmark">
          <span className="navbar__wordmark-bit">BIT</span>
          <span className="navbar__wordmark-amp">&amp;</span>
          <span className="navbar__wordmark-build">BUILD</span>
        </Link>

        <nav className="navbar__nav">
          <a href="#about" className="navbar__link">About</a>
        </nav>

        <div className="navbar__actions">
          <span className="navbar__tagline">24hr college hackathon</span>
          {isAuthenticated ? (
            <Button to={`/${role}`} variant="secondary">
              Dashboard
            </Button>
          ) : (
            <Button to="/login" variant="secondary">
              Portal Login
            </Button>
          )}
        </div>
      </PageContainer>
    </header>
  );
}

export default Navbar;
