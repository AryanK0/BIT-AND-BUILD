import { Link } from 'react-router-dom';
import PageContainer from './PageContainer.jsx';
import './Navbar.css';
import './NavbarEnhancements.css';

function Navbar() {
  return (
    <header className="navbar">
      <PageContainer className="navbar__inner">
        <Link to="/" className="navbar__wordmark" aria-label="BIT & BUILD home">
          <span className="navbar__wordmark-bit">BIT</span>
          <span className="navbar__wordmark-amp">&amp;</span>
          <span className="navbar__wordmark-build">BUILD</span>
        </Link>
        <nav className="navbar__nav">
          <a href="#about" className="navbar__link">About</a>
        </nav>
        <div className="navbar__actions">
          <span className="navbar__tagline">24 HR HACKATHON</span>
        </div>
      </PageContainer>
    </header>
  );
}

export default Navbar;
