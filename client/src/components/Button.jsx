import { Link } from 'react-router-dom';
import './Button.css';

function Button({ children, to, onClick, variant = 'primary', type = 'button', disabled = false, loading = false, ...rest }) {
  const className = `btn btn--${variant} ${loading ? 'btn--loading' : ''} ${disabled ? 'btn--disabled' : ''}`;

  const content = (
    <>
      {loading && <span className="btn__spinner" />}
      <span className={loading ? 'btn__text--hidden' : ''}>{children}</span>
    </>
  );

  if (to && !disabled) {
    return (
      <Link to={to} className={className} {...rest}>
        {content}
      </Link>
    );
  }

  return (
    <button type={type} className={className} onClick={onClick} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
}

export default Button;
