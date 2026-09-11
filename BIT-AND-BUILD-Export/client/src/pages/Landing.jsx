import { useEffect, useRef } from 'react';
import Navbar from '../components/Navbar.jsx';
import Button from '../components/Button.jsx';
import BackgroundEffects from '../components/BackgroundEffects.jsx';
import PageContainer from '../components/PageContainer.jsx';
import './Landing.css';
import './LandingEnhancements.css';

function Landing() {
  const observerRef = useRef(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('visible');
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    document.querySelectorAll('.animate-on-scroll').forEach((el) => observerRef.current.observe(el));
    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div className="landing">
      <Navbar />

      <section className="landing__hero">
        <BackgroundEffects />
        <PageContainer className="landing__hero-inner">
          <p className="landing__eyebrow animate-on-scroll">🕸️ International Hackathon</p>
          <h1 className="landing__headline glitch-text" data-text="BIT & BUILD">
            BIT <span className="landing__amp">&</span> BUILD
          </h1>
          <p className="landing__dimension-label animate-on-scroll">ENTER THE DIMENSION OF BUILDERS</p>
          <p className="landing__tagline animate-on-scroll">Into the Codeverse</p>
          <p className="landing__subhead animate-on-scroll">
            One campus, one night, one build. BIT & BUILD brings student teams
            together for a fast, focused sprint from idea to working demo —
            judged by people who've shipped real products.
          </p>
          <div className="landing__hero-actions animate-on-scroll">
            <Button to="/login" variant="primary">🔐 Login</Button>
          </div>
        </PageContainer>
      </section>

      <section className="landing__about" id="about">
        <PageContainer>
          <div className="landing__section-header animate-on-scroll">
            <span className="landing__section-tag">What is this?</span>
            <h2 className="landing__section-title">More Than a <span className="glow-text">Hackathon</span></h2>
            <p className="landing__section-desc">
              BIT & BUILD isn't just about writing code — it's about turning wild ideas into
              tangible products in record time. Think of it as a creative pressure cooker.
            </p>
          </div>

          <div className="landing__about-grid">
            {[
              { title: 'Ideate', icon: '💡', desc: 'Brainstorm with your team. No idea is too wild — the multiverse has room for everything.' },
              { title: 'Build', icon: '⚡', desc: '24 hours of focused building. Ship a working prototype that solves a real problem.' },
              { title: 'Demo', icon: '🎤', desc: 'Present your creation to industry judges. Tell your story, show your impact.' },
              { title: 'Win', icon: '🏆', desc: 'Cash prizes, internship ops, and industry recognition. Your code could change everything.' },
            ].map((card, i) => (
              <div className="landing__about-card glass-card animate-on-scroll" key={card.title} style={{ animationDelay: `${i * 0.15}s` }}>
                <span className="landing__about-card-icon">{card.icon}</span>
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
                <div className="landing__about-card-number">{String(i + 1).padStart(2, '0')}</div>
              </div>
            ))}
          </div>
        </PageContainer>
      </section>

      <footer className="landing__footer">
        <PageContainer className="landing__footer-inner">
          <div className="landing__footer-brand">
            <span className="landing__footer-wordmark">BIT <span>&amp;</span> BUILD</span>
            <p>Built by students, for students.</p>
          </div>

          <div className="landing__footer-links">
            <a href="#about">About</a>
          </div>

          <div className="landing__contact-block">
            <span className="landing__contact-heading">POINTS OF CONTACT</span>
            <div className="landing__contact-person">
              <strong>SHIVAIN ARORA</strong>
              <a href="tel:7696518189">7696518189</a>
            </div>
            <div className="landing__contact-person">
              <strong>ARYAN KHURRANA</strong>
              <a href="tel:8847529191">8847529191</a>
            </div>
          </div>

          <div className="landing__maker-block">
            <div className="landing__maker-photo" role="img" aria-label="Photo of Shivain Arora" />
            <p>MADE BY : SHIVAIN ARORA</p>
          </div>

          <div className="landing__footer-copy">
            <p>© 2026 BIT & BUILD. All rights reserved.</p>
          </div>
        </PageContainer>
      </footer>
    </div>
  );
}

export default Landing;
