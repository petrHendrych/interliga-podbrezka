const COLS = 30;
const ROWS = 55;
const MAX_SIZE = 7;
const MIN_SIZE = 1.5;
/** Below this a dot is no longer perceptible, so it is not worth rendering. */
const MIN_OPACITY = 0.02;
/** How far the hypotenuse wanders in and out, as a fraction of its own length. */
const EDGE_WAVE = 0.07;
const EDGE_WAVE_FREQUENCY = 5.5;
/** Blur in px, from the crisp corner outwards. The band count sets the steps. */
const BLUR_STEPS = [0, 0.45, 0.9, 1.5, 2.3];

interface Dot {
  x: number;
  y: number;
  r: number;
  opacity: number;
}

interface Band {
  blur: number;
  dots: Dot[];
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * A right triangle of evenly spaced dots, its right angle at the corner of the
 * box and its legs running the full width and height. Spacing is constant; size
 * and opacity fall off along the diagonal while blur grows, so the corner reads
 * dense and crisp and the tip dissolves into the page. The hypotenuse is given a
 * slow wave so the field does not end on a ruled line.
 *
 * Dots are grouped into bands because blur has to be applied per group rather
 * than per circle — one filtered <g> each, instead of ~500 filtered elements.
 */
function buildBands(phase: number): Band[] {
  const bands: Band[] = BLUR_STEPS.map((blur) => ({ blur, dots: [] }));

  for (let col = 0; col < COLS; col += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      const u = (col + 0.5) / COLS;
      const v = (row + 0.5) / ROWS;
      // Where the hypotenuse sits for this dot; 1 would be the straight line.
      const edge = 1 + EDGE_WAVE * Math.sin(EDGE_WAVE_FREQUENCY * (u - v) + phase);
      // 0 at the right angle, 1 out on the hypotenuse.
      const d = (u + v) / edge;
      const opacity = (1 - d) ** 1.5;

      if (d <= 1 && opacity >= MIN_OPACITY) {
        const step = Math.min(BLUR_STEPS.length - 1, Math.floor(d * BLUR_STEPS.length));
        bands[step].dots.push({
          x: round(u * 100),
          y: round(v * 100),
          r: round((MAX_SIZE - (MAX_SIZE - MIN_SIZE) * d) / 2),
          opacity: round(opacity),
        });
      }
    }
  }

  return bands.filter((band) => band.dots.length > 0);
}

// The two corners run different wave phases so they are not a mirrored pair.
const TOP_LEFT = buildBands(0);
const BOTTOM_RIGHT = buildBands(2.1);

function DotField({ bands, className }: { bands: Band[]; className: string }) {
  return (
    // Sized in pixels rather than viewport units so the grid keeps the same
    // spacing on a phone and on a desktop (13px and 18px cells). The fill sits
    // here so it is not repeated on every one of the ~700 circles.
    <svg
      className={`absolute h-[715px] w-[390px] fill-decor-dot md:h-[990px] md:w-[540px] ${className}`}
      style={{ opacity: 'var(--decor-dot-opacity)' }}
    >
      {bands.map((band) => (
        <g
          key={band.blur}
          style={band.blur ? { filter: `blur(${band.blur}px)` } : undefined}
        >
          {band.dots.map((dot) => (
            // Percentage centres scale with the box; the radius stays in px so
            // the dots stay round rather than stretching with it.
            <circle
              key={`${dot.x}-${dot.y}`}
              cx={`${dot.x}%`}
              cy={`${dot.y}%`}
              r={dot.r}
              opacity={dot.opacity}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

export function BackgroundDots() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Offset by the header height so the densest dots aren't hidden behind it. */}
      <DotField bands={TOP_LEFT} className="top-16 left-0" />
      <DotField bands={BOTTOM_RIGHT} className="bottom-0 right-0 rotate-180" />
    </div>
  );
}
