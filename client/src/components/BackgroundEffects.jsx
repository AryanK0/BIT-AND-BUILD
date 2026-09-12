import './BackgroundEffects.css';

/* Skyline silhouette, back-to-front. Each entry: x, width, height (from
   the 0..460 baseline). Hand-placed (not randomized) so the roofline reads
   as a deliberate profile rather than noise. */
const BACK_BUILDINGS = [
  { x: -60, w: 150, h: 90 }, { x: 100, w: 110, h: 140 }, { x: 220, w: 170, h: 80 },
  { x: 400, w: 100, h: 160 }, { x: 500, w: 130, h: 110 }, { x: 640, w: 150, h: 190 },
  { x: 800, w: 110, h: 100 }, { x: 920, w: 170, h: 150 }, { x: 1100, w: 120, h: 120 },
  { x: 1230, w: 160, h: 200 }, { x: 1400, w: 110, h: 110 }, { x: 1500, w: 160, h: 150 },
];

const MID_BUILDINGS = [
  { x: -40, w: 130, h: 170, tier: 20 }, { x: 130, w: 160, h: 230, tier: 30 },
  { x: 320, w: 110, h: 150 }, { x: 460, w: 150, h: 260, tier: 40 },
  { x: 640, w: 130, h: 190 }, { x: 800, w: 170, h: 280, tier: 35 },
  { x: 1000, w: 120, h: 160 }, { x: 1150, w: 150, h: 240, tier: 25 },
  { x: 1330, w: 130, h: 180 }, { x: 1480, w: 160, h: 220, tier: 30 },
];

const FRONT_BUILDINGS = [
  { x: -50, w: 170, h: 240, tier: 30, antenna: false },
  { x: 150, w: 130, h: 320, tier: 40, antenna: true },
  { x: 320, w: 190, h: 200, tier: 0, antenna: false },
  { x: 540, w: 150, h: 360, tier: 50, antenna: false, tower: true },
  { x: 720, w: 210, h: 250, tier: 30, antenna: false },
  { x: 960, w: 150, h: 400, tier: 45, antenna: true },
  { x: 1140, w: 200, h: 230, tier: 0, antenna: false },
  { x: 1380, w: 170, h: 300, tier: 35, antenna: false },
];

/* A handful of intentionally-placed lit windows per front building,
   given as fractional [x, y] positions within that building's box. */
const LIT_WINDOWS = [
  [0.2, 0.3], [0.6, 0.55], [0.35, 0.7], [0.75, 0.2], [0.5, 0.4],
];

function Building({ x, w, h, tier = 0, antenna, tower, base, pattern, litColor }) {
  const top = base - h;
  return (
    <g>
      <rect x={x} y={top} width={w} height={h} fill="currentColor" />
      {tier > 0 && (
        <rect x={x + w * 0.22} y={top - tier} width={w * 0.56} height={tier} fill="currentColor" />
      )}
      {pattern && (
        <rect x={x + 4} y={top + 6} width={w - 8} height={h - 10} fill={`url(#${pattern})`} />
      )}
      {litColor &&
        LIT_WINDOWS.slice(0, tower ? 5 : 2).map(([fx, fy], i) => (
          <rect
            key={i}
            className="bg-effects__lit-window"
            x={x + w * fx}
            y={top + h * fy}
            width="6"
            height="8"
            fill={litColor}
            style={{ animationDelay: `${i * 1.3}s` }}
          />
        ))}
      {antenna && (
        <line x1={x + w / 2} y1={top - tier} x2={x + w / 2} y2={top - tier - 34} stroke="currentColor" strokeWidth="3" />
      )}
      {tower && (
        <>
          <line x1={x + w / 2} y1={top - tier} x2={x + w / 2} y2={top - tier - 54} stroke="currentColor" strokeWidth="3" />
          <circle cx={x + w / 2} cy={top - tier - 58} r="5" fill="currentColor" className="bg-effects__lit-window" />
        </>
      )}
    </g>
  );
}

function Cityscape() {
  return (
    <div className="bg-effects__city">
      <svg viewBox="0 0 1600 460" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="win-dim" width="30" height="36" patternUnits="userSpaceOnUse">
            <rect x="4" y="5" width="7" height="9" fill="#3a3a7a" opacity="0.35" />
            <rect x="18" y="5" width="7" height="9" fill="#3a3a7a" opacity="0.35" />
            <rect x="4" y="20" width="7" height="9" fill="#3a3a7a" opacity="0.35" />
            <rect x="18" y="20" width="7" height="9" fill="#3a3a7a" opacity="0.35" />
          </pattern>
          <pattern id="win-front" width="26" height="30" patternUnits="userSpaceOnUse">
            <rect x="4" y="4" width="6" height="8" fill="#5555aa" opacity="0.4" />
            <rect x="16" y="4" width="6" height="8" fill="#5555aa" opacity="0.4" />
            <rect x="4" y="17" width="6" height="8" fill="#5555aa" opacity="0.4" />
            <rect x="16" y="17" width="6" height="8" fill="#5555aa" opacity="0.4" />
          </pattern>
          <linearGradient id="city-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#BE2EDD" stopOpacity="0" />
            <stop offset="100%" stopColor="#BE2EDD" stopOpacity="0.16" />
          </linearGradient>
        </defs>

        {/* horizon haze, ties the skyline back to the glow orbs above */}
        <rect x="0" y="260" width="1600" height="200" fill="url(#city-haze)" />

        <g className="bg-effects__city-layer bg-effects__city-layer--back">
          {BACK_BUILDINGS.map((b, i) => (
            <Building key={i} {...b} base={460} />
          ))}
        </g>

        <g className="bg-effects__city-layer bg-effects__city-layer--mid">
          {MID_BUILDINGS.map((b, i) => (
            <Building key={i} {...b} base={460} pattern="win-dim" />
          ))}
        </g>

        <g className="bg-effects__city-layer bg-effects__city-layer--front">
          {FRONT_BUILDINGS.map((b, i) => (
            <Building
              key={i}
              {...b}
              base={460}
              pattern="win-front"
              litColor={i % 3 === 0 ? '#FF2D95' : i % 3 === 1 ? '#00D2FF' : '#FFC312'}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

function BackgroundEffects({ variant = 'default' }) {
  return (
    <div className={`bg-effects bg-effects--${variant}`} aria-hidden="true">
      {/* Multi-color glow orbs */}
      <div className="bg-effects__glow bg-effects__glow--pink" />
      <div className="bg-effects__glow bg-effects__glow--purple" />
      <div className="bg-effects__glow bg-effects__glow--blue" />

      {/* Comic-style vector skyline, anchored low so it never competes with copy */}
      {variant !== 'compact' && <Cityscape />}

      {/* Comic dot pattern overlay */}
      <div className="bg-effects__dots" />

      {/* Floating particles */}
      <div className="bg-effects__particles">
        {Array.from({ length: 20 }).map((_, i) => (
          <span
            key={i}
            className="bg-effects__particle"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 8}s`,
              animationDuration: `${6 + Math.random() * 8}s`,
              '--particle-color': ['#FF2D95', '#1B9CFC', '#BE2EDD', '#FFC312', '#00D2FF'][i % 5],
              '--particle-size': `${2 + Math.random() * 4}px`,
            }}
          />
        ))}
      </div>

      {/* Spider-Verse corner web — chromatic-split ink threads, glowing knots, comic burst anchor */}
      <svg
        className="bg-effects__strands"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMaxYMin slice"
      >
        <defs>
          <linearGradient id="strand-grad-pink" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF2D95" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#FF2D95" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="strand-grad-blue" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1B9CFC" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#1B9CFC" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="strand-grad-purple" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#BE2EDD" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#BE2EDD" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="strand-grad-cyan" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00D2FF" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#00D2FF" stopOpacity="0" />
          </linearGradient>
          {/* comic-print misregistration: soft glow so the chromatic offsets read as ink, not noise */}
          <filter id="web-ink" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="0.6" result="soft" />
            <feMerge>
              <feMergeNode in="soft" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* radial threads — each drawn 3x with a 1-2px RGB-split offset, like a
            slightly misregistered comic print, then a crisp line on top */}
        {[
          { end: [1143, 847], ctrl: [1204, 417], grad: 'pink' },
          { end: [819, 831], ctrl: [1002, 393], grad: 'blue' },
          { end: [538, 701], ctrl: [905, 346], grad: 'purple' },
          { end: [337, 480], ctrl: [756, 216], grad: 'pink' },
          { end: [254, 229], ctrl: [765, 111], grad: 'cyan' },
          { end: [281, 3], ctrl: [734, -20], grad: 'purple' },
          { end: [373, -179], ctrl: [816, -96], grad: 'blue' },
        ].map(({ end, ctrl, grad }, i) => {
          const d = `M 1220 -30 Q ${ctrl[0]} ${ctrl[1]} ${end[0]} ${end[1]}`;
          return (
            <g key={i} className="bg-effects__strand" style={{ animationDelay: `${i * 0.3}s` }} filter="url(#web-ink)">
              <path d={d} fill="none" stroke="#FF2D95" strokeWidth="1" opacity="0.18" transform="translate(-2,-1.5)" />
              <path d={d} fill="none" stroke="#00D2FF" strokeWidth="1" opacity="0.18" transform="translate(2,1.5)" />
              <path d={d} fill="none" stroke={`url(#strand-grad-${grad})`} strokeWidth="1.4" />
            </g>
          );
        })}

        {/* concentric rings — the web's spiral, same ink treatment, thinner */}
        <g fill="none" stroke="#dcdcff" strokeWidth="0.75" opacity="0.24" filter="url(#web-ink)">
          <path d="M 1206 128 L 1148 125 L 1097 102 L 1061 62 L 1046 17 L 1051 -24 L 1068 -57" className="bg-effects__web-ring" />
          <path d="M 1194 268 L 1083 263 L 988 219 L 920 143 L 892 58 L 901 -19 L 932 -81" className="bg-effects__web-ring" style={{ animationDelay: '0.4s' }} />
          <path d="M 1182 408 L 1019 400 L 879 336 L 778 225 L 737 99 L 750 -14 L 797 -105" className="bg-effects__web-ring" style={{ animationDelay: '0.8s' }} />
          <path d="M 1168 566 L 947 555 L 756 467 L 619 317 L 563 146 L 581 -8 L 644 -132" className="bg-effects__web-ring" style={{ animationDelay: '1.2s' }} />
          <path d="M 1155 715 L 879 702 L 640 592 L 469 403 L 399 190 L 421 -2 L 500 -157" className="bg-effects__web-ring" style={{ animationDelay: '1.6s' }} />
        </g>

        {/* glowing silk knots where the outer ring crosses each thread */}
        {[
          { p: [1168, 566], c: '#FF2D95' }, { p: [947, 555], c: '#00D2FF' },
          { p: [756, 467], c: '#FFC312' }, { p: [619, 317], c: '#FF2D95' },
          { p: [563, 146], c: '#BE2EDD' }, { p: [581, -8], c: '#00D2FF' },
          { p: [644, -132], c: '#FFC312' },
        ].map(({ p, c }, i) => (
          <g key={i} className="bg-effects__web-node" style={{ animationDelay: `${i * 0.4}s` }}>
            <circle cx={p[0]} cy={p[1]} r="6" fill={c} opacity="0.15" />
            <circle cx={p[0]} cy={p[1]} r="2.5" fill={c} opacity="0.8" />
          </g>
        ))}

        {/* comic "thwip" burst where the web anchors to the corner */}
        <g stroke="#f0f0ff" strokeWidth="1" opacity="0.35" strokeLinecap="round">
          <line x1="1220" y1="-30" x2="1180" y2="-46" />
          <line x1="1220" y1="-30" x2="1196" y2="4" />
          <line x1="1220" y1="-30" x2="1160" y2="-14" />
          <line x1="1220" y1="-30" x2="1204" y2="-70" />
        </g>
      </svg>
    </div>
  );
}

export default BackgroundEffects;