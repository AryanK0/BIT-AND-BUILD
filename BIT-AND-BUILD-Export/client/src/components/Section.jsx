import PageContainer from './PageContainer.jsx';
import './Section.css';

function Section({ children, className = '', id }) {
  return (
    <section id={id} className={`section ${className}`.trim()}>
      <PageContainer>{children}</PageContainer>
    </section>
  );
}

export default Section;
