import React from 'react';
import type {IconName} from '../../src/schema';

// Flat icons drawn in code, 100x100 box. Brand colors plus a few soft accents.
const O = '#FF7A1A';
const Y = '#FFD23F';
const C = '#3DF5FF';
const W = '#FFFFFF';
const N = '#1B1F3B';
const G = '#5BE38A';
const P = '#FF6FAE';
const B = '#4D8BFF';
const R = '#FF4D5E';
const T = '#B5763A';

const star = (cx: number, cy: number, r: number, ir = 0.45) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * ir;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
};

const rays = (cx: number, cy: number, r1: number, r2: number, n: number, color: string, w = 6) =>
  new Array(n).fill(0).map((_, i) => {
    const a = (i / n) * Math.PI * 2;
    return (
      <line
        key={i}
        x1={cx + Math.cos(a) * r1}
        y1={cy + Math.sin(a) * r1}
        x2={cx + Math.cos(a) * r2}
        y2={cy + Math.sin(a) * r2}
        stroke={color}
        strokeWidth={w}
        strokeLinecap="round"
      />
    );
  });

const ICON_DRAW: Record<IconName, React.ReactNode> = {
  sun: (
    <>
      {rays(50, 50, 32, 44, 12, Y)}
      <circle cx={50} cy={50} r={24} fill={Y} />
      <circle cx={50} cy={50} r={18} fill={O} opacity={0.35} />
    </>
  ),
  moon: (
    <>
      <circle cx={50} cy={50} r={34} fill="#E8E6F0" />
      <circle cx={38} cy={40} r={7} fill="#C9C5D8" />
      <circle cx={60} cy={62} r={9} fill="#C9C5D8" />
      <circle cx={62} cy={34} r={4} fill="#C9C5D8" />
    </>
  ),
  planet: (
    <>
      <circle cx={50} cy={50} r={26} fill={O} />
      <path d="M28,44 Q50,38 72,44" stroke={Y} strokeWidth={5} fill="none" opacity={0.7} />
      <path d="M27,56 Q50,62 73,56" stroke={Y} strokeWidth={4} fill="none" opacity={0.5} />
      <ellipse cx={50} cy={52} rx={46} ry={11} fill="none" stroke={C} strokeWidth={5} transform="rotate(-15 50 52)" />
    </>
  ),
  earth: (
    <>
      <circle cx={50} cy={50} r={36} fill={B} />
      <path d="M30,30 Q42,26 46,36 Q40,46 48,52 Q44,62 34,58 Q26,48 30,30Z" fill={G} />
      <path d="M58,22 Q72,26 78,40 Q70,44 62,38 Q56,30 58,22Z" fill={G} />
      <path d="M60,60 Q72,56 76,64 Q70,78 58,76 Q54,68 60,60Z" fill={G} />
    </>
  ),
  star: <path d={star(50, 52, 42)} fill={Y} />,
  rocket: (
    <>
      <path d="M50,8 Q70,26 68,62 L32,62 Q30,26 50,8Z" fill={W} />
      <circle cx={50} cy={36} r={9} fill={C} stroke={N} strokeWidth={4} />
      <path d="M32,50 L18,70 L32,66Z" fill={O} />
      <path d="M68,50 L82,70 L68,66Z" fill={O} />
      <path d="M38,62 L62,62 L56,74 L44,74Z" fill={N} />
      <path d="M42,76 Q50,98 58,76Z" fill={Y} />
    </>
  ),
  comet: (
    <>
      <path d="M70,30 L14,74" stroke={C} strokeWidth={14} strokeLinecap="round" opacity={0.35} />
      <path d="M68,34 L24,82" stroke={C} strokeWidth={8} strokeLinecap="round" opacity={0.5} />
      <circle cx={70} cy={30} r={16} fill={W} />
      <circle cx={70} cy={30} r={10} fill={C} />
    </>
  ),
  galaxy: (
    <>
      <path d="M50,50 m-6,0 a6,6 0 1,1 12,0 a14,14 0 1,1 -28,0 a24,24 0 1,1 48,0 a34,34 0 1,1 -68,0" stroke={P} strokeWidth={6} fill="none" strokeLinecap="round" />
      <circle cx={50} cy={50} r={8} fill={W} />
      <circle cx={80} cy={24} r={3} fill={Y} />
      <circle cx={18} cy={80} r={3} fill={Y} />
    </>
  ),
  blackhole: (
    <>
      <ellipse cx={50} cy={50} rx={46} ry={16} fill="none" stroke={O} strokeWidth={8} />
      <ellipse cx={50} cy={50} rx={36} ry={10} fill="none" stroke={Y} strokeWidth={4} />
      <circle cx={50} cy={50} r={22} fill="#05060F" stroke={O} strokeWidth={3} />
    </>
  ),
  astronaut: (
    <>
      <rect x={28} y={50} width={44} height={40} rx={14} fill={W} />
      <circle cx={50} cy={36} r={24} fill={W} />
      <rect x={34} y={26} width={32} height={22} rx={11} fill={N} />
      <rect x={38} y={30} width={10} height={6} rx={3} fill={C} opacity={0.8} />
      <rect x={42} y={60} width={16} height={10} rx={3} fill={O} />
    </>
  ),
  heart: <path d="M50,86 C10,58 12,24 34,20 C44,18 50,28 50,32 C50,28 56,18 66,20 C88,24 90,58 50,86Z" fill={R} />,
  brain: (
    <>
      <path d="M50,20 C34,10 14,22 18,40 C8,48 12,66 26,70 C30,84 46,84 50,76 C54,84 70,84 74,70 C88,66 92,48 82,40 C86,22 66,10 50,20Z" fill={P} />
      <path d="M50,22 L50,76 M32,34 Q40,40 34,50 M68,34 Q60,40 66,50 M28,58 Q38,56 40,66 M72,58 Q62,56 60,66" stroke="#D94C8C" strokeWidth={4} fill="none" strokeLinecap="round" />
    </>
  ),
  eye: (
    <>
      <path d="M6,50 Q50,8 94,50 Q50,92 6,50Z" fill={W} />
      <circle cx={50} cy={50} r={20} fill={C} />
      <circle cx={50} cy={50} r={10} fill={N} />
      <circle cx={44} cy={44} r={4} fill={W} />
    </>
  ),
  bone: (
    <g transform="rotate(-35 50 50)">
      <rect x={24} y={42} width={52} height={16} rx={8} fill={W} />
      <circle cx={22} cy={40} r={11} fill={W} />
      <circle cx={22} cy={60} r={11} fill={W} />
      <circle cx={78} cy={40} r={11} fill={W} />
      <circle cx={78} cy={60} r={11} fill={W} />
    </g>
  ),
  dna: (
    <>
      <path d="M32,8 C68,30 32,70 68,92" stroke={C} strokeWidth={7} fill="none" strokeLinecap="round" />
      <path d="M68,8 C32,30 68,70 32,92" stroke={O} strokeWidth={7} fill="none" strokeLinecap="round" />
      {[20, 35, 50, 65, 80].map((y) => (
        <line key={y} x1={38} y1={y} x2={62} y2={y} stroke={W} strokeWidth={4} opacity={0.7} />
      ))}
    </>
  ),
  lungs: (
    <>
      <path d="M50,12 L50,46 M50,40 L40,48 M50,40 L60,48" stroke={W} strokeWidth={6} strokeLinecap="round" fill="none" />
      <path d="M40,40 C24,30 12,50 14,74 C16,88 32,90 40,82Z" fill={P} />
      <path d="M60,40 C76,30 88,50 86,74 C84,88 68,90 60,82Z" fill={P} />
    </>
  ),
  tooth: <path d="M30,14 C40,10 46,18 50,18 C54,18 60,10 70,14 C86,20 82,46 74,58 C70,70 70,90 62,90 C54,90 56,66 50,66 C44,66 46,90 38,90 C30,90 30,70 26,58 C18,46 14,20 30,14Z" fill={W} />,
  cell: (
    <>
      <circle cx={50} cy={50} r={40} fill={G} opacity={0.35} stroke={G} strokeWidth={4} />
      <circle cx={46} cy={46} r={14} fill="#8E6BFF" />
      <ellipse cx={70} cy={66} rx={8} ry={4} fill={O} />
      <ellipse cx={30} cy={70} rx={6} ry={3} fill={O} />
      <circle cx={68} cy={32} r={4} fill={Y} />
    </>
  ),
  hand: (
    <>
      <rect x={28} y={46} width={44} height={42} rx={16} fill={Y} />
      {[30, 42, 54].map((x, i) => (
        <rect key={x} x={x} y={14 + (i === 1 ? -4 : 2)} width={11} height={40} rx={5.5} fill={Y} />
      ))}
      <rect x={64} y={22} width={11} height={34} rx={5.5} fill={Y} />
      <rect x={10} y={48} width={30} height={12} rx={6} fill={Y} transform="rotate(35 26 54)" />
    </>
  ),
  ear: (
    <>
      <path d="M62,90 C40,92 44,70 34,62 C24,54 22,40 28,28 C38,8 76,10 78,38 C80,54 66,58 66,72 C66,84 66,90 62,90Z" fill={O} />
      <path d="M44,40 C46,26 64,26 64,40 C64,50 54,50 54,58" stroke={Y} strokeWidth={6} fill="none" strokeLinecap="round" />
    </>
  ),
  paw: (
    <>
      <ellipse cx={50} cy={64} rx={22} ry={18} fill={O} />
      <ellipse cx={24} cy={44} rx={9} ry={11} fill={O} />
      <ellipse cx={40} cy={28} rx={9} ry={12} fill={O} />
      <ellipse cx={60} cy={28} rx={9} ry={12} fill={O} />
      <ellipse cx={76} cy={44} rx={9} ry={11} fill={O} />
    </>
  ),
  fish: (
    <>
      <path d="M14,50 Q44,18 72,50 Q44,82 14,50Z" fill={C} />
      <path d="M70,50 L92,32 L88,50 L92,68Z" fill={B} />
      <circle cx={30} cy={46} r={5} fill={N} />
      <path d="M44,36 Q52,50 44,64" stroke={B} strokeWidth={4} fill="none" />
    </>
  ),
  bird: (
    <>
      <ellipse cx={46} cy={56} rx={30} ry={22} fill={B} />
      <circle cx={66} cy={36} r={16} fill={B} />
      <path d="M80,36 L94,40 L80,44Z" fill={Y} />
      <circle cx={70} cy={32} r={4} fill={N} />
      <path d="M30,50 Q44,36 56,54 Q40,62 30,50Z" fill={C} />
    </>
  ),
  octopus: (
    <>
      <ellipse cx={50} cy={38} rx={28} ry={26} fill={P} />
      {[22, 34, 46, 58, 70].map((x, i) => (
        <path key={x} d={`M${x + 4},56 Q${x - 4 + (i % 2) * 10},76 ${x + 4},88`} stroke={P} strokeWidth={8} fill="none" strokeLinecap="round" />
      ))}
      <circle cx={40} cy={38} r={5} fill={N} />
      <circle cx={60} cy={38} r={5} fill={N} />
    </>
  ),
  bee: (
    <>
      <ellipse cx={36} cy={30} rx={14} ry={10} fill={C} opacity={0.6} transform="rotate(-25 36 30)" />
      <ellipse cx={60} cy={28} rx={14} ry={10} fill={C} opacity={0.6} transform="rotate(25 60 28)" />
      <ellipse cx={50} cy={58} rx={32} ry={24} fill={Y} />
      <rect x={40} y={34} width={8} height={48} fill={N} />
      <rect x={56} y={36} width={8} height={44} fill={N} />
      <circle cx={26} cy={54} r={4} fill={N} />
    </>
  ),
  butterfly: (
    <>
      <ellipse cx={30} cy={36} rx={20} ry={18} fill={O} />
      <ellipse cx={70} cy={36} rx={20} ry={18} fill={O} />
      <ellipse cx={32} cy={66} rx={15} ry={14} fill={Y} />
      <ellipse cx={68} cy={66} rx={15} ry={14} fill={Y} />
      <rect x={46} y={24} width={8} height={56} rx={4} fill={N} />
    </>
  ),
  whale: (
    <>
      <path d="M10,54 Q14,30 46,30 Q76,30 80,52 L94,40 L90,62 L80,58 Q74,78 44,78 Q12,78 10,54Z" fill={B} />
      <path d="M14,60 Q44,72 76,60 Q70,76 44,76 Q20,76 14,60Z" fill={C} opacity={0.6} />
      <circle cx={28} cy={48} r={4} fill={N} />
      <path d="M44,28 Q40,16 34,14 M44,28 Q48,16 54,14" stroke={C} strokeWidth={4} fill="none" strokeLinecap="round" />
    </>
  ),
  turtle: (
    <>
      <ellipse cx={46} cy={56} rx={32} ry={22} fill={G} />
      <path d="M30,48 L46,40 L62,48 L62,62 L46,70 L30,62Z" fill="#3BB56A" />
      <circle cx={84} cy={54} r={10} fill={G} />
      <circle cx={86} cy={52} r={2.5} fill={N} />
      <ellipse cx={24} cy={76} rx={8} ry={6} fill={G} />
      <ellipse cx={64} cy={78} rx={8} ry={6} fill={G} />
    </>
  ),
  ant: (
    <>
      <circle cx={22} cy={50} r={11} fill={R} />
      <ellipse cx={46} cy={52} rx={11} ry={9} fill={R} />
      <ellipse cx={74} cy={52} rx={17} ry={14} fill={R} />
      <path d="M40,58 L32,76 M48,60 L48,80 M56,58 L66,76 M18,40 L10,26 M24,40 L28,26" stroke={R} strokeWidth={4} strokeLinecap="round" />
    </>
  ),
  snail: (
    <>
      <path d="M8,78 L86,78 Q92,78 90,70 L80,52" stroke={Y} strokeWidth={12} strokeLinecap="round" fill="none" />
      <circle cx={46} cy={50} r={26} fill={O} />
      <path d="M46,50 m0,-6 a6,6 0 1,1 -6,6 a12,12 0 1,1 12,12 a18,18 0 1,1 -18,-18" stroke={Y} strokeWidth={4} fill="none" />
      <path d="M80,52 L76,36 M84,54 L88,38" stroke={Y} strokeWidth={4} strokeLinecap="round" />
    </>
  ),
  leaf: (
    <>
      <path d="M18,82 Q14,22 84,16 Q86,80 18,82Z" fill={G} />
      <path d="M18,82 Q44,52 70,30" stroke="#2F9C58" strokeWidth={5} fill="none" strokeLinecap="round" />
    </>
  ),
  tree: (
    <>
      <rect x={43} y={56} width={14} height={36} rx={4} fill={T} />
      <circle cx={50} cy={36} r={26} fill={G} />
      <circle cx={30} cy={50} r={16} fill={G} />
      <circle cx={70} cy={50} r={16} fill={G} />
    </>
  ),
  flower: (
    <>
      <path d="M50,60 L50,94" stroke={G} strokeWidth={6} />
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx={50} cy={22} rx={12} ry={18} fill={P} transform={`rotate(${a} 50 40)`} />
      ))}
      <circle cx={50} cy={40} r={11} fill={Y} />
    </>
  ),
  mountain: (
    <>
      <path d="M4,88 L38,24 L58,58 L68,42 L96,88Z" fill="#8E7CC3" />
      <path d="M38,24 L48,43 L40,40 L32,46Z" fill={W} />
      <path d="M68,42 L75,54 L66,52Z" fill={W} />
    </>
  ),
  volcano: (
    <>
      <path d="M8,90 L36,40 L64,40 L92,90Z" fill={T} />
      <path d="M36,40 L44,52 L50,44 L56,54 L64,40Z" fill={O} />
      <circle cx={42} cy={22} r={10} fill="#9A9AB0" />
      <circle cx={58} cy={16} r={12} fill="#9A9AB0" />
      <path d="M50,40 L50,30" stroke={Y} strokeWidth={6} strokeLinecap="round" />
    </>
  ),
  wave: (
    <>
      <path d="M4,60 Q20,30 36,50 Q50,66 60,44 Q70,20 92,34 Q78,40 80,54 Q84,70 96,66 L96,92 L4,92Z" fill={B} />
      <path d="M4,72 Q26,60 46,74 Q68,86 96,74" stroke={C} strokeWidth={5} fill="none" />
    </>
  ),
  cloud: (
    <>
      <circle cx={34} cy={56} r={18} fill={W} />
      <circle cx={54} cy={44} r={22} fill={W} />
      <circle cx={72} cy={58} r={16} fill={W} />
      <rect x={30} y={56} width={46} height={18} fill={W} />
    </>
  ),
  snowflake: (
    <>
      {[0, 60, 120].map((a) => (
        <g key={a} transform={`rotate(${a} 50 50)`}>
          <line x1={50} y1={8} x2={50} y2={92} stroke={C} strokeWidth={6} strokeLinecap="round" />
          <path d="M40,18 L50,28 L60,18 M40,82 L50,72 L60,82" stroke={C} strokeWidth={5} fill="none" strokeLinecap="round" />
        </g>
      ))}
    </>
  ),
  fire: (
    <>
      <path d="M50,6 C62,26 82,36 80,62 C78,82 64,94 50,94 C36,94 20,84 20,62 C20,46 32,40 34,24 C42,34 44,42 46,46 C50,32 48,20 50,6Z" fill={O} />
      <path d="M50,48 C58,58 66,64 64,76 C62,86 56,90 50,90 C42,90 36,84 36,76 C36,66 46,62 50,48Z" fill={Y} />
    </>
  ),
  drop: (
    <>
      <path d="M50,8 C64,32 78,48 78,64 C78,82 64,92 50,92 C36,92 22,82 22,64 C22,48 36,32 50,8Z" fill={C} />
      <ellipse cx={40} cy={62} rx={6} ry={10} fill={W} opacity={0.6} />
    </>
  ),
  atom: (
    <>
      {[0, 60, 120].map((a) => (
        <ellipse key={a} cx={50} cy={50} rx={42} ry={15} fill="none" stroke={C} strokeWidth={5} transform={`rotate(${a} 50 50)`} />
      ))}
      <circle cx={50} cy={50} r={9} fill={O} />
    </>
  ),
  bolt: <path d="M58,4 L20,56 L46,56 L38,96 L80,40 L54,40Z" fill={Y} />,
  magnet: (
    <>
      <path d="M18,14 L38,14 L38,54 Q38,66 50,66 Q62,66 62,54 L62,14 L82,14 L82,54 Q82,88 50,88 Q18,88 18,54Z" fill={R} />
      <rect x={18} y={14} width={20} height={14} fill={W} />
      <rect x={62} y={14} width={20} height={14} fill={W} />
    </>
  ),
  clock: (
    <>
      <circle cx={50} cy={50} r={40} fill={W} />
      <circle cx={50} cy={50} r={34} fill={N} />
      <path d="M50,50 L50,28 M50,50 L66,58" stroke={Y} strokeWidth={6} strokeLinecap="round" />
      <circle cx={50} cy={50} r={4} fill={O} />
    </>
  ),
  thermometer: (
    <>
      <rect x={40} y={8} width={20} height={64} rx={10} fill={W} />
      <circle cx={50} cy={76} r={18} fill={W} />
      <rect x={45} y={30} width={10} height={44} rx={5} fill={R} />
      <circle cx={50} cy={76} r={12} fill={R} />
    </>
  ),
  lightbulb: (
    <>
      <path d="M50,8 C72,8 84,26 78,46 C74,58 64,62 64,72 L36,72 C36,62 26,58 22,46 C16,26 28,8 50,8Z" fill={Y} />
      <rect x={36} y={74} width={28} height={8} rx={3} fill={W} />
      <rect x={40} y={84} width={20} height={8} rx={3} fill={W} />
      <path d="M42,60 L46,40 L54,40 L58,60" stroke={O} strokeWidth={4} fill="none" />
    </>
  ),
  ruler: (
    <g transform="rotate(-30 50 50)">
      <rect x={6} y={36} width={88} height={28} rx={4} fill={Y} />
      {[16, 26, 36, 46, 56, 66, 76, 86].map((x, i) => (
        <line key={x} x1={x} y1={36} x2={x} y2={i % 2 === 0 ? 52 : 46} stroke={N} strokeWidth={3} />
      ))}
    </g>
  ),
  weight: (
    <>
      <path d="M26,34 L74,34 L88,90 L12,90Z" fill="#7A7F9A" />
      <circle cx={50} cy={24} r={12} fill="none" stroke="#7A7F9A" strokeWidth={7} />
      <text x={50} y={74} textAnchor="middle" fontSize={24} fontWeight={700} fill={W} fontFamily="sans-serif">
        KG
      </text>
    </>
  ),
  speed: (
    <>
      <path d="M10,70 A40,40 0 0,1 90,70" stroke={W} strokeWidth={10} fill="none" strokeLinecap="round" />
      <path d="M60,36 A40,40 0 0,1 90,70" stroke={O} strokeWidth={10} fill="none" strokeLinecap="round" />
      <path d="M50,70 L74,44" stroke={Y} strokeWidth={7} strokeLinecap="round" />
      <circle cx={50} cy={70} r={7} fill={Y} />
    </>
  ),
  // ---- general icons (money, tech, history, mind, language, motivation) ----
  coin: (
    <>
      <circle cx={50} cy={50} r={38} fill={Y} />
      <circle cx={50} cy={50} r={29} fill="none" stroke={O} strokeWidth={4} opacity={0.6} />
      <text x={50} y={64} textAnchor="middle" fontSize={40} fontWeight={700} fill={O} fontFamily="sans-serif">$</text>
    </>
  ),
  chart: (
    <>
      <rect x={14} y={58} width={16} height={28} rx={3} fill={C} />
      <rect x={38} y={42} width={16} height={44} rx={3} fill={B} />
      <rect x={62} y={24} width={16} height={62} rx={3} fill={G} />
      <path d="M12,48 L40,30 L58,38 L86,14" stroke={Y} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  wallet: (
    <>
      <rect x={12} y={26} width={76} height={54} rx={10} fill={T} />
      <rect x={12} y={20} width={64} height={16} rx={6} fill={G} />
      <rect x={58} y={44} width={34} height={20} rx={8} fill="#8A5527" />
      <circle cx={70} cy={54} r={5} fill={Y} />
    </>
  ),
  piggybank: (
    <>
      <ellipse cx={50} cy={56} rx={36} ry={26} fill={P} />
      <circle cx={80} cy={52} r={10} fill={P} />
      <circle cx={84} cy={52} r={2.5} fill={N} />
      <path d="M34,32 L40,18 L48,32Z" fill={P} />
      <rect x={30} y={76} width={10} height={14} rx={3} fill={P} />
      <rect x={58} y={76} width={10} height={14} rx={3} fill={P} />
      <rect x={42} y={34} width={18} height={5} rx={2} fill={N} opacity={0.6} />
      <circle cx={62} cy={48} r={3} fill={N} />
    </>
  ),
  phone: (
    <>
      <rect x={28} y={8} width={44} height={84} rx={9} fill={N} stroke={W} strokeWidth={4} />
      <rect x={33} y={18} width={34} height={60} rx={3} fill={C} opacity={0.85} />
      <circle cx={50} cy={84} r={3.5} fill={W} />
    </>
  ),
  laptop: (
    <>
      <rect x={18} y={20} width={64} height={44} rx={5} fill={N} stroke={W} strokeWidth={4} />
      <rect x={24} y={26} width={52} height={32} rx={2} fill={B} />
      <path d="M8,70 L92,70 L84,82 L16,82Z" fill={W} />
    </>
  ),
  robot: (
    <>
      <line x1={50} y1={10} x2={50} y2={24} stroke={W} strokeWidth={4} />
      <circle cx={50} cy={10} r={6} fill={Y} />
      <rect x={20} y={24} width={60} height={50} rx={14} fill="#C9D3E6" />
      <rect x={28} y={34} width={44} height={26} rx={8} fill={N} />
      <circle cx={40} cy={47} r={6} fill={C} />
      <circle cx={60} cy={47} r={6} fill={C} />
      <rect x={34} y={78} width={32} height={12} rx={4} fill="#C9D3E6" />
    </>
  ),
  chip: (
    <>
      {[26, 42, 58, 74].map((v) => (
        <React.Fragment key={v}>
          <rect x={v - 3} y={6} width={6} height={14} fill={W} />
          <rect x={v - 3} y={80} width={6} height={14} fill={W} />
          <rect x={6} y={v - 3} width={14} height={6} fill={W} />
          <rect x={80} y={v - 3} width={14} height={6} fill={W} />
        </React.Fragment>
      ))}
      <rect x={18} y={18} width={64} height={64} rx={8} fill={N} stroke={C} strokeWidth={4} />
      <rect x={36} y={36} width={28} height={28} rx={4} fill={C} />
    </>
  ),
  book: (
    <>
      <path d="M50,24 C40,16 22,16 10,20 L10,82 C22,78 40,78 50,86Z" fill={B} />
      <path d="M50,24 C60,16 78,16 90,20 L90,82 C78,78 60,78 50,86Z" fill={C} />
      <path d="M18,34 C28,30 38,31 44,35 M18,48 C28,44 38,45 44,49 M56,35 C62,31 72,30 82,34 M56,49 C62,45 72,44 82,48" stroke={W} strokeWidth={3} fill="none" opacity={0.7} />
    </>
  ),
  scroll: (
    <>
      <rect x={22} y={18} width={56} height={64} fill="#F3E2B8" />
      <rect x={14} y={12} width={72} height={12} rx={6} fill={T} />
      <rect x={14} y={76} width={72} height={12} rx={6} fill={T} />
      <path d="M32,36 L68,36 M32,48 L68,48 M32,60 L58,60" stroke={T} strokeWidth={4} strokeLinecap="round" />
    </>
  ),
  crown: (
    <>
      <path d="M12,74 L18,28 L36,50 L50,20 L64,50 L82,28 L88,74Z" fill={Y} />
      <rect x={12} y={74} width={76} height={12} rx={3} fill={O} />
      <circle cx={50} cy={60} r={6} fill={R} />
      <circle cx={30} cy={64} r={4} fill={C} />
      <circle cx={70} cy={64} r={4} fill={C} />
    </>
  ),
  castle: (
    <>
      <rect x={16} y={40} width={68} height={50} fill="#B9B4CC" />
      <path d="M16,40 L16,28 L26,28 L26,36 L36,36 L36,28 L46,28 L46,36 L54,36 L54,28 L64,28 L64,36 L74,36 L74,28 L84,28 L84,40Z" fill="#B9B4CC" />
      <path d="M40,90 L40,66 Q50,54 60,66 L60,90Z" fill={N} />
      <rect x={24} y={50} width={8} height={12} fill={N} />
      <rect x={68} y={50} width={8} height={12} fill={N} />
    </>
  ),
  globe: (
    <>
      <circle cx={50} cy={50} r={38} fill={B} />
      <ellipse cx={50} cy={50} rx={16} ry={38} fill="none" stroke={W} strokeWidth={3} opacity={0.8} />
      <path d="M12,50 L88,50 M18,30 L82,30 M18,70 L82,70" stroke={W} strokeWidth={3} opacity={0.8} />
    </>
  ),
  speech: (
    <>
      <path d="M14,20 L86,20 Q92,20 92,26 L92,62 Q92,68 86,68 L44,68 L26,86 L28,68 L14,68 Q8,68 8,62 L8,26 Q8,20 14,20Z" fill={W} />
      <circle cx={32} cy={44} r={5} fill={N} />
      <circle cx={50} cy={44} r={5} fill={N} />
      <circle cx={68} cy={44} r={5} fill={N} />
    </>
  ),
  quote: (
    <>
      <path d="M14,58 Q14,26 42,20 L44,28 Q30,34 30,46 L42,46 L42,78 L14,78Z" fill={Y} />
      <path d="M56,58 Q56,26 84,20 L86,28 Q72,34 72,46 L84,46 L84,78 L56,78Z" fill={O} />
    </>
  ),
  trophy: (
    <>
      <path d="M28,14 L72,14 L70,46 Q66,62 50,64 Q34,62 30,46Z" fill={Y} />
      <path d="M28,22 Q10,22 14,38 Q18,48 30,48" stroke={Y} strokeWidth={6} fill="none" />
      <path d="M72,22 Q90,22 86,38 Q82,48 70,48" stroke={Y} strokeWidth={6} fill="none" />
      <rect x={44} y={62} width={12} height={14} fill={O} />
      <rect x={30} y={76} width={40} height={12} rx={3} fill={O} />
    </>
  ),
  target: (
    <>
      <circle cx={50} cy={50} r={40} fill={R} />
      <circle cx={50} cy={50} r={29} fill={W} />
      <circle cx={50} cy={50} r={18} fill={R} />
      <circle cx={50} cy={50} r={7} fill={W} />
    </>
  ),
  smile: (
    <>
      <circle cx={50} cy={50} r={40} fill={Y} />
      <circle cx={36} cy={40} r={6} fill={N} />
      <circle cx={64} cy={40} r={6} fill={N} />
      <path d="M28,58 Q50,82 72,58" stroke={N} strokeWidth={6} fill="none" strokeLinecap="round" />
    </>
  ),
  calendar: (
    <>
      <rect x={12} y={18} width={76} height={70} rx={8} fill={W} />
      <rect x={12} y={18} width={76} height={20} rx={8} fill={R} />
      <rect x={28} y={10} width={8} height={18} rx={4} fill={N} />
      <rect x={64} y={10} width={8} height={18} rx={4} fill={N} />
      {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} x={22 + c * 15} y={46 + r * 13} width={10} height={8} rx={2} fill={N} opacity={0.5} />))}
    </>
  ),
  lock: (
    <>
      <path d="M30,44 L30,32 Q30,12 50,12 Q70,12 70,32 L70,44" stroke="#C9D3E6" strokeWidth={9} fill="none" />
      <rect x={20} y={42} width={60} height={46} rx={8} fill={Y} />
      <circle cx={50} cy={60} r={7} fill={N} />
      <rect x={47} y={62} width={6} height={14} rx={2} fill={N} />
    </>
  ),
  sound: (
    <>
      <path d="M12,40 L28,40 L48,22 L48,78 L28,60 L12,60Z" fill={W} />
      <path d="M60,36 Q68,50 60,64" stroke={C} strokeWidth={6} fill="none" strokeLinecap="round" />
      <path d="M70,26 Q84,50 70,74" stroke={C} strokeWidth={6} fill="none" strokeLinecap="round" />
      <path d="M80,16 Q100,50 80,84" stroke={C} strokeWidth={6} fill="none" strokeLinecap="round" opacity={0.6} />
    </>
  ),
};

export const Icon: React.FC<{name: IconName; size: number; style?: React.CSSProperties}> = ({name, size, style}) => (
  <svg viewBox="0 0 100 100" width={size} height={size} style={{overflow: 'visible', ...style}}>
    {ICON_DRAW[name] ?? ICON_DRAW.star}
  </svg>
);
