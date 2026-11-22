const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const RAD = Math.PI / 180;

const FX_GAIN = 5;
const SHOCK_GAIN = 1.8;
const SHOCK_MAX_R = 0.55;
const SPARK_GAIN = 1.35;
const DUST_GAIN = 1.8;
const BLOOM_SCALE = 0.25;
const MAX_PARTICLES = 3200;

const G = (zh, en) => ({ 'zh-CN': zh, en });
const SETTINGS = [
  { key: 'glow',   type: 'number', label: G('辉光强度', 'Glow intensity'),   group: G('热控 / HEAT', 'HEAT'),   min: 0,   max: 2,    step: 0.01, defaultValue: 2.0 },
  { key: 'peak',   type: 'number', label: G('白热峰值', 'White-hot peak'),   group: G('热控 / HEAT', 'HEAT'),   min: 0,   max: 1,    step: 0.01, defaultValue: 1.0 },
  { key: 'cool',   type: 'number', label: G('冷却速度', 'Cooling rate'),     group: G('热控 / HEAT', 'HEAT'),   min: 0.5, max: 2,    step: 0.01, defaultValue: 0.70 },
  { key: 'density', type: 'number', label: G('密度', 'Density'),             group: G('火花 / SPARK', 'SPARK'),  min: 0,   max: 3,    step: 0.01, defaultValue: 2.33 },
  { key: 'gravity', type: 'number', label: G('重力', 'Gravity (px/s²)'),     group: G('火花 / SPARK', 'SPARK'),  min: 200, max: 1000, step: 10,    defaultValue: 200 },
  { key: 'speed',   type: 'number', label: G('初速', 'Initial velocity'),    group: G('火花 / SPARK', 'SPARK'),  min: 0.5, max: 1.8,  step: 0.01, defaultValue: 0.50 },
  { key: 'life',    type: 'number', label: G('余烬寿命', 'Ember lifetime'),  group: G('火花 / SPARK', 'SPARK'),  min: 0.5, max: 2,    step: 0.01, defaultValue: 2.00 },
  { key: 'shake',  type: 'number', label: G('震动强度', 'Shake intensity'),  group: G('冲击 / IMPACT', 'IMPACT'), min: 0,   max: 1,    step: 0.01, defaultValue: 1.0 },
  { key: 'shock',  type: 'number', label: G('冲击波', 'Shockwave'),          group: G('冲击 / IMPACT', 'IMPACT'), min: 0,   max: 1.5,  step: 0.01, defaultValue: 1.5 },
  { key: 'rhythm', type: 'number', label: G('节奏灵敏度', 'Rhythm sensitivity'), group: G('冲击 / IMPACT', 'IMPACT'), min: 0, max: 1, step: 0.01, defaultValue: 1.0 },
  { key: 'asym',   type: 'number', label: G('不对称度', 'Asymmetry'),        group: G('真实度 / REALISM', 'REALISM'), min: 0, max: 1, step: 0.01, defaultValue: 1.0 },
  { key: 'vig',    type: 'number', label: G('暗角收缩', 'Vignette'),         group: G('真实度 / REALISM', 'REALISM'), min: 0, max: 1, step: 0.01, defaultValue: 0.60 },
  { key: 'bloom',  type: 'boolean', label: G('Bloom 后处理', 'Bloom post'),  group: G('真实度 / REALISM', 'REALISM'), defaultValue: true },
  { key: 'bloomStrength', type: 'number', label: G('Bloom 强度', 'Bloom strength'), group: G('真实度 / REALISM', 'REALISM'), min: 0, max: 1.5, step: 0.01, defaultValue: 0.75 },
  { key: 'ambient', type: 'boolean', label: G('环境余烬', 'Ambient embers'), group: G('真实度 / REALISM', 'REALISM'), defaultValue: true },
  { key: 'firstToss', type: 'boolean', label: G('句首上抛动画', 'Lead word toss'), group: G('真实度 / REALISM', 'REALISM'), defaultValue: false },
  { key: 'palette', type: 'select', label: G('配色', 'Thermal profile'),    group: G('配色 / THERMAL PROFILE', 'THERMAL PROFILE'),
    options: [
      { value: 'standard', label: G('标准锻热', 'Standard forge') },
      { value: 'whitehot', label: G('白热极限', 'White-hot limit') },
      { value: 'quench',   label: G('冷淬', 'Quench') },
    ], defaultValue: 'standard' },
  { key: 'reduce',     type: 'boolean', label: G('减少动态', 'Reduce motion'),        group: G('安全 / SAFETY', 'SAFETY'), defaultValue: false },
  { key: 'flashLimit', type: 'boolean', label: G('高频闪光限制', 'Flash-rate limit'), group: G('安全 / SAFETY', 'SAFETY'), defaultValue: false },
];
const DEFAULTS = Object.fromEntries(SETTINGS.map(s => [s.key, s.defaultValue]));

const PALETTES = {
  standard: {
    stops: ['#FFF8E7', '#FFE9A8', '#FFC23D', '#F5821F', '#B3240A', '#5C1108', '#23211F'],
    hot: '#E24E14', red: '#B3240A', peak: '#FFF8E7', steel: '#C4C2B8',
  },
  whitehot: {
    stops: ['#FFFFFF', '#FFFDF2', '#FFE9B8', '#FFB459', '#E24E14', '#7A1A08', '#23211F'],
    hot: '#FFD9A0', red: '#E24E14', peak: '#FFFFFF', steel: '#E8E6DE',
  },
  quench: {
    stops: ['#EAF6FF', '#C9ECEC', '#6FB2B8', '#2E6B73', '#12333A', '#1A262B', '#14181B'],
    hot: '#6FB2B8', red: '#2E6B73', peak: '#EAF6FF', steel: '#C9ECEC',
  },
};
function buildLut(stops) {
  const rgb = stops.map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const lut = new Array(256);
  for (let i = 0; i < 256; i++) {
    const p = i / 255 * (rgb.length - 1), i0 = Math.floor(p), i1 = Math.min(rgb.length - 1, i0 + 1), f = p - i0;
    lut[i] = `rgb(${Math.round(lerp(rgb[i0][0], rgb[i1][0], f))},${Math.round(lerp(rgb[i0][1], rgb[i1][1], f))},${Math.round(lerp(rgb[i0][2], rgb[i1][2], f))})`;
  }
  return lut;
}
const LUTS = Object.fromEntries(Object.entries(PALETTES).map(([k, v]) => [k, buildLut(v.stops)]));
const LUTS_RGB = Object.fromEntries(
  Object.entries(LUTS).map(([k, lut]) => [k, lut.map(s => {
    const m = s.match(/\d+/g);
    return m ? [+m[0], +m[1], +m[2]] : [255, 200, 120];
  })])
);

function chooseShape(r) {
  if (r < 0.58) return 'trail';
  if (r < 0.76) return 'cross';
  if (r < 0.94) return 'debris';
  return 'scale';
}

const FORK_MIN = 0.08, FORK_MAX = 0.18, FORK_END = 0.62;
const BRANCH_AT = 0.10;
function forkAtOf(p) { return FORK_MIN + fracRand(p.seed || 0, 5.3) * (FORK_MAX - FORK_MIN); }
function drawSparkShape(c, p, u, colRgb, alpha) {
  const sz = p.size * (1 - u * 0.35);
  const rgb = `${colRgb[0]},${colRgb[1]},${colRgb[2]}`;

  const preFork = p.shape === 'cross' && u < (p.variant === 2 ? forkAtOf(p) : BRANCH_AT);
  if (p.shape === 'trail' || preFork || (p.shape !== 'scale' && p.layer === 2 && u < 0.5)) {
    const shrink = u > 0.75 ? 1 - (u - 0.75) * 1.6 : 1;
    const tailLen = (p.layer === 2 ? 0.070 : 0.055) * shrink;
    const tx = p.x - p.vx * tailLen, ty = p.y - p.vy * tailLen;

    c.lineCap = 'round';
    if (sz > 1.5) {
      c.fillStyle = `rgba(${rgb},${(alpha * 0.20).toFixed(3)})`;
      c.beginPath(); c.arc(p.x, p.y, sz * 1.45 * shrink, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
    c.lineWidth = Math.max(0.5, sz * 0.82);
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(tx, ty); c.stroke();

    if (sz > 0.9) {
      c.fillStyle = `rgba(${rgb},${Math.min(1, alpha * 1.05).toFixed(3)})`;
      c.beginPath(); c.arc(p.x, p.y, Math.max(0.55, sz * 0.82 * shrink), 0, Math.PI * 2); c.fill();
    }
    return;
  }
  if (p.shape === 'cross') {
    if (p.variant !== 2) return;
    const sd = p.seed || 0;
    const fa = forkAtOf(p);
    if (u >= fa && u < FORK_END) {
      const lu = (u - fa) / (FORK_END - fa);
      const len = (9 + sz * 5.2) * (1 - lu * 0.55);
      const fade = alpha * (1 - lu);
      c.strokeStyle = `rgba(${rgb},${fade.toFixed(3)})`;
      c.lineWidth = Math.max(0.7, sz * 0.62);
      c.save(); c.translate(p.x, p.y);
      c.lineCap = 'round';
      c.rotate(Math.atan2(p.vy, p.vx) + Math.PI / 2 + (p.rot || 0) * 0.12);
      const sX = 0.40 + (sd % 7) * 0.055;
      const aS = fracRand(sd, 11.7) < 0.5, aF = fracRand(sd, 13.3) < 0.5;
      const kSL = aS ? 0.35 + fracRand(sd, 23.9) * 0.20 : 0.75 + fracRand(sd, 23.9) * 0.25;
      const kSR = aS ? 0.75 + fracRand(sd, 29.1) * 0.25 : 0.35 + fracRand(sd, 29.1) * 0.20;
      const kFL = aF ? 0.35 + fracRand(sd, 37.1) * 0.20 : 0.75 + fracRand(sd, 37.1) * 0.25;
      const kFR = aF ? 0.75 + fracRand(sd, 41.9) * 0.25 : 0.35 + fracRand(sd, 41.9) * 0.20;
      const mid = -len * 0.1;
      const arm = (sign, kS, kF) => {
        const y = len * 0.95 * kF;
        return [sign * Math.min(len * sX * kS, y * 0.92), -y];
      };
      const aL = arm(-1, kSL, kFL), aR = arm(1, kSR, kFR);
      c.beginPath();
      c.moveTo(0, len * 0.7);
      c.lineTo(0, mid);
      c.moveTo(0, mid); c.lineTo(aL[0], aL[1]);
      c.moveTo(0, mid); c.lineTo(aR[0], aR[1]);
      c.moveTo(0, mid); c.lineTo(((sd | 0) % 3 - 1) * len * 0.12, -len * 0.95 * Math.max(kFL, kFR) * 1.1);
      c.stroke();
      c.restore(); return;
    }
  }
  c.save(); c.translate(p.x, p.y); c.rotate(p.rot || 0);
  if (p.shape === 'scale') {
    const v = p.variant || 0;
    const sw = 3.4 + sz * 1.6, sh = 1.1 + sz * 0.38;
    c.fillStyle = `rgba(${rgb},${(alpha * 0.56).toFixed(3)})`;
    c.scale(1, 1 - u * 0.6);
    if (v === 1) {
      c.beginPath(); c.moveTo(0, -sh * 1.4); c.lineTo(sw, 0);
      c.lineTo(0, sh * 1.4); c.lineTo(-sw, 0); c.closePath(); c.fill();
      c.strokeStyle = `rgba(255,226,190,${(alpha * 0.34).toFixed(3)})`;
      c.lineWidth = Math.max(0.45, sz * 0.2);
      c.beginPath(); c.moveTo(0, -sh * 1.1); c.lineTo(0, sh * 1.1); c.stroke();
    } else {
      c.beginPath(); c.moveTo(-sw, -sh); c.lineTo(sw * 0.7, -sh * 0.35);
      c.lineTo(sw, sh); c.lineTo(-sw * 0.55, sh * 0.6); c.closePath(); c.fill();
    }
  } else {
    c.fillStyle = `rgba(${rgb},${(alpha * 0.82).toFixed(3)})`;
    c.beginPath();
    const vs = p.verts || [1, 1, 1];
    for (let k = 0; k < vs.length; k++) {
      const a = k / vs.length * Math.PI * 2, rr = sz * vs[k];
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr * (0.55 + 0.25 * (k % 2));
      if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath(); c.fill();
  }
  c.restore();
}
function wScale(level) { return level === 3 ? 1.15 : level === 2 ? 0.92 : 0.72; }

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function fracRand(seed, offset) {
  const x = Math.sin(seed + offset) * 10000;
  return x - Math.floor(x);
}

function makeSpring(k = 200, c = 20) { return { x: 0, v: 0, k, c }; }
function stepSpring(s, target, dt) {
  dt = Math.min(dt, 0.05);
  const steps = Math.max(1, Math.ceil(dt / 0.016));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const a = -s.k * (s.x - target) - s.c * s.v;
    s.v += a * h;
    s.x += s.v * h;
  }
}

const PUNCT = /^[\s,，。.!！?？;；:：、·"'“”‘’()（）\[\]【】—…\-]+$/;
function buildDisplayWords(line, segmentWords, folium) {
  const raw = line.words && line.words.length ? line.words : [
    { text: line.fullText, startTime: line.startTime, endTime: line.endTime },
  ];

  const words = raw.map(w => ({
    ...w,
    startTime: Number.isFinite(w.startTime) ? w.startTime
             : Number.isFinite(w.start) ? w.start
             : (Number.isFinite(line.startTime) ? line.startTime : 0),
    endTime: Number.isFinite(w.endTime) ? w.endTime
           : Number.isFinite(w.end) ? w.end
           : (Number.isFinite(line.endTime) ? line.endTime : 0),
  }));

  const spans = [];
  words.forEach(word => {
    const chars = Array.from(word.text || '');
    const dur = Math.max(0.001, word.endTime - word.startTime);
    chars.forEach((ch, ci) => {
      spans.push({
        start: word.startTime + dur * ci / chars.length,
        end: word.startTime + dur * (ci + 1) / chars.length,
      });
    });
  });

  let segments = null;
  if (segmentWords && folium && folium.lyrics) {
    try { segments = folium.lyrics.segmentWords(line); } catch (e) { segments = null; }
  }

  let out = [];
  if (segments && segments.length) {
    segments.forEach(seg => {
      const text = seg.segment;
      const chars = Array.from(text);
      if (!chars.length) return;
      const idx = clamp(seg.index, 0, Math.max(0, spans.length - (seg.isWordLike ? 1 : 0)));
      const take = seg.isWordLike ? Math.max(1, chars.length) : 0;
      let start = spans[idx] ? spans[idx].start : line.startTime;
      let end = spans[Math.min(spans.length - 1, idx + Math.max(0, take - 1))] ? spans[Math.min(spans.length - 1, idx + Math.max(0, take - 1))].end : line.endTime;
      if (PUNCT.test(text) || !seg.isWordLike) {
        if (out.length) { out[out.length - 1].text += text; return; }
      }
      out.push({ text, start, end, isFirst: out.length === 0, isLast: false });
    });
  } else {
    let pendingPunct = '';
    words.forEach((word, wi) => {
      const chars = Array.from(word.text || '');
      if (!chars.length) return;
      const dur = Math.max(0.001, word.endTime - word.startTime);
      chars.forEach((ch, ci) => {
        const start = word.startTime + dur * ci / chars.length;
        const end = word.startTime + dur * (ci + 1) / chars.length;
        if (PUNCT.test(ch)) { pendingPunct += ch; return; }
        out.push({ text: ch + pendingPunct, start, end, isFirst: out.length === 0 && wi === 0, isLast: false });
        pendingPunct = '';
      });
      if (pendingPunct && out.length) out[out.length - 1].text += pendingPunct;
    });
  }
  if (out.length) out[out.length - 1].isLast = true;

  const VERB = /[砸裂碎燃烧爆轰斩破铸锻熔烫射破侵犯]/;
  const INTERJ = /[啊呀哦唉嘿哇]/;
  const PUNCT_STRONG = /[！？!?]/;
  out.forEach(w => {
    const ch0 = Array.from(w.text)[0] || '';
    let weight = 0;
    if (VERB.test(ch0)) weight += 40;
    if (INTERJ.test(ch0)) weight += 26;
    if (PUNCT_STRONG.test(ch0)) weight += 30;
    const dur = w.end - w.start;
    if (dur >= 0.6) weight += 24;
    if (w.isFirst) weight += 22;
    if (w.isLast) weight += 10;
    w.weight = weight;
    w.strong = VERB.test(ch0) || PUNCT_STRONG.test(ch0);
  });
  return out;
}

const LAYOUT_CACHE_MAX = 48;
function chunkLine(displayWords, rowCount, seed) {
  const n = displayWords.length;
  const rows = [];
  let idx = 0, remainingRows = rowCount;
  while (idx < n && remainingRows > 0) {
    const remainingUnits = n - idx;
    const avg = remainingUnits / remainingRows;
    let len = remainingRows === 1 ? remainingUnits
      : clamp(Math.round(avg + (fracRand(seed, idx) - 0.5) * avg), 1, Math.ceil(avg * 1.5));
    len = Math.min(len, remainingUnits - (remainingRows - 1));
    rows.push(displayWords.slice(idx, idx + len));
    idx += len; remainingRows--;
  }
  return rows;
}

function buildLayout(line, displayWords, intensity, staggerMin, staggerMax, containerH, seed) {
  const totalGraphemes = Math.max(
    Array.from((line.fullText || '').replace(/\s+/g, '')).length,
    displayWords.length, 1
  );
  const targetRows = Math.max(1, Math.floor(containerH * 0.65 / 100));
  const rowCount = Math.min(displayWords.length, targetRows);
  const chunks = chunkLine(displayWords, rowCount, seed);
  const calm = intensity === 'calm', chaotic = intensity === 'chaotic';
  const baseSpread = chaotic ? 15 : calm ? 0 : 6;
  const baseRotate = chaotic ? 8 : calm ? 0 : 3;

  const rows = chunks.map((chunk, rowIndex) => {
    const rowBias = rowIndex - (chunks.length - 1) / 2;
    const isLeft = rowIndex % 2 === 0;
    const mag = staggerMin + fracRand(seed, rowIndex + 11) * Math.max(0, staggerMax - staggerMin);
    const rowX = (isLeft ? -1 : 1) * mag;
    const rowY = calm ? 0 : rowBias * 2.5;
    const rowRotate = chaotic ? (isLeft ? -3 : 3) : 0;
    const chunkGraphemes = Array.from(chunk.map(cw => cw.text).join('').replace(/\s+/g, '')).length;
    const staggerScale = calm ? 1 : 0.8 + fracRand(seed, rowIndex + 41) * 0.9;
    const rowScale = staggerScale * (chaotic ? 1 + Math.min(chunkGraphemes * 0.01, 0.05) : 1);
    const wordSeed = chunk[0] ? chunk[0].start * 1000 : seed;
    const words = chunk.map((w, wi) => {
      const s = wordSeed + wi * 7.13;
      return {
        ...w,
        x: isCalmZero(calm, (fracRand(s, 1) - 0.5) * 2 * baseSpread),
        y: isCalmZero(calm, (fracRand(s, 2) - 0.5) * 2 * baseSpread),
        rotate: isCalmZero(calm, (fracRand(s, 3) - 0.5) * 2 * baseRotate),
        passedRotate: isCalmZero(calm, (fracRand(s, 8) - 0.5) * 20),
        scale: rowScale,
      };
    });
    return {
      words, rowX, rowY, rowRotate,
      passedRotate: (isLeft ? 1 : -1) * (chaotic ? 6 : 3),
      isLeft, rowIndex,
      marginBottom: chaotic ? 0.4 : 0.6,
      alignSelf: 'center',
    };
  });
  return {
    rows, totalGraphemes,
    perspective: chaotic ? 720 : 1000,
    densityScale: totalGraphemes > 40 ? 0.8 : 1,
  };
}
function isCalmZero(calm, v) { return calm ? 0 : v; }

function layoutCacheKey(line, intensity, staggerMin, staggerMax, H) {
  const seg = (line.wordSegments || []).join('\u0001');
  return [
    line.startTime, line.endTime, line.fullText, seg,
    intensity, Math.round(H / 24), staggerMin, staggerMax,
  ].join('|');
}

function sungRange(line) {
  const st = Number.isFinite(line.startTime) ? line.startTime : 0;
  let lastEnd = 0;
  if (Array.isArray(line.words)) {
    for (const w of line.words) {
      const e = Number.isFinite(w.endTime) ? w.endTime
              : Number.isFinite(w.end) ? w.end : 0;
      if (e > lastEnd) lastEnd = e;
    }
  }
  if (lastEnd <= st && Number.isFinite(line.endTime)) lastEnd = line.endTime;
  return { start: st, end: lastEnd > st ? lastEnd : st + 0.1 };
}

function lineEnergy(line, prevLine) {
  if (!line) return 1;
  const words = Array.isArray(line.words) && line.words.length ? line.words : null;
  const rg = sungRange(line);
  const dur = Math.max(0.1, rg.end - rg.start);
  let charCount = 0;
  if (words) {
    for (const w of words) charCount += Array.from(w.text || '').length;
  } else {
    charCount = Array.from(line.fullText || '').length;
  }
  if (!charCount) return 1;
  const charsPerSec = charCount / dur;
  const gap = prevLine ? Math.max(0, rg.start - sungRange(prevLine).end) : 0;
  const gapFactor = gap > 2 ? 0.75 : gap > 0.5 ? 0.9 : 1.0;
  const density = clamp(charsPerSec / 4, 0.55, 1.5);
  return clamp(density * gapFactor, 0.55, 1.35);
}

const AMBIENT_OVERRIDES = {
  quench: ['#E8F4F8', '#E8F4F8', '#A8DCE0', '#6FB2B8'],
};

const BUILTIN_FONT_STACKS = {
  sans: '"Inter", "Noto Sans CJK SC", "Noto Sans JP", "Source Han Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
  serif: '"Iowan Old Style", "Noto Serif CJK SC", "Noto Serif JP", "Source Han Serif SC", "Songti SC", "STSong", "Georgia", serif',
  mono: '"IBM Plex Mono", "Sarasa Mono SC", "Noto Sans Mono CJK SC", "Noto Sans Mono", "SFMono-Regular", Consolas, monospace',
};
const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong']);
function resolveFontStack(theme) {
  const style = (theme && theme.fontStyle) || 'sans';
  const fallback = BUILTIN_FONT_STACKS[style] || BUILTIN_FONT_STACKS.sans;
  const raw = [theme && theme.fontFamily, ...((theme && theme.fontFamilyStack) || [])].filter(Boolean);
  const seen = new Set(), custom = [];
  for (const item of raw) {
    const name = String(item).trim().replace(/^['"]|['"]$/g, '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    custom.push(GENERIC_FAMILIES.has(key) ? name : '"' + name.replace(/["\\]/g, '\\$&') + '"');
  }
  return custom.length ? custom.join(', ') + ', ' + fallback : fallback;
}
function resolveFontWeight(theme, fallback) {
  const v = theme && theme.fontWeight;
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.round(clamp(v, 100, 900) / 10) * 10;
}

const GLOW_LINE_HEIGHT = 1.22;
const ACTIVE_SCALE = 1.4;
const MIN_FIT = 0.5;
const FIT_SLACK = 0.98;
const WORD_GAP = '0.8rem';

function measureOverlapFit(area, line) {
  let padT = 0, padB = 0, padL = 0, padR = 0;
  try {
    const cs = (typeof getComputedStyle !== 'undefined' && getComputedStyle) ? getComputedStyle(area) : null;
    if (cs) {
      padT = parseFloat(cs.paddingTop) || 0; padB = parseFloat(cs.paddingBottom) || 0;
      padL = parseFloat(cs.paddingLeft) || 0; padR = parseFloat(cs.paddingRight) || 0;
    }
  } catch (e) { }
  const areaH = (area.clientHeight || 0) - padT - padB;
  const areaW = (area.clientWidth || 0) - padL - padR;
  const lineH = line.offsetHeight || 0;
  if (!lineH || !areaH) return 1;
  let widest = 0;
  if (line.children) for (const row of line.children) widest = Math.max(widest, row.offsetWidth || 0);
  if (line.querySelectorAll) {
    const rows = line.querySelectorAll('[data-overlap-fit-row]');
    for (const row of rows) widest = Math.max(widest, row.offsetWidth || 0);
  }
  const ratio = Math.min(areaH / lineH, widest > 0 && areaW > 0 ? areaW / widest : Infinity);
  if (!(ratio < 1)) return 1;
  return Math.max(MIN_FIT, ratio * FIT_SLACK);
}

function computePartitaSpacing(layout) {
  return layout.rows.map(row => ({
    wordMargins: row.words.map(() => WORD_GAP),
    marginBottom: `${row.marginBottom != null ? row.marginBottom : 0.6}rem`,
  }));
}

let _rustTexUrl = '';
function rustTexUrl() {
  if (_rustTexUrl) return _rustTexUrl;
  try {
    const rand = mulberry32(4471), S = 192;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const cx = cv.getContext('2d');
    const img = cx.createImageData(S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = rand(), n2 = rand(), v = Math.floor(34 + n * 54 + n2 * 22);
      d[i] = v + 18; d[i + 1] = Math.floor(v * .72); d[i + 2] = Math.floor(v * .54); d[i + 3] = Math.floor(52 + n * 96);
    }
    cx.putImageData(img, 0, 0);
    for (let b = 0; b < 46; b++) {
      const x = rand() * S, y = rand() * S, r = 5 + rand() * 24;
      const g = cx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(122,46,23,' + (.18 + rand() * .28).toFixed(3) + ')');
      g.addColorStop(.55, 'rgba(74,31,18,' + (.1 + rand() * .18).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(20,17,14,0)');
      cx.fillStyle = g; cx.beginPath(); cx.ellipse(x, y, r, r * (.35 + rand() * .55), rand() * Math.PI, 0, Math.PI * 2); cx.fill();
    }
    cx.globalCompositeOperation = 'screen';
    for (let k = 0; k < 64; k++) {
      const sx = rand() * S, sy = rand() * S, len = 8 + rand() * 58, ang = (rand() < .55 ? -8 : 6) * RAD + (rand() - .5) * .24;
      cx.strokeStyle = 'rgba(196,194,184,' + (.035 + rand() * .08).toFixed(3) + ')'; cx.lineWidth = rand() < .75 ? .5 : 1;
      cx.beginPath(); cx.moveTo(sx, sy); cx.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len); cx.stroke();
    }
    _rustTexUrl = cv.toDataURL('image/png');
  } catch (e) { _rustTexUrl = 'none'; }
  return _rustTexUrl;
}
const FACE_BG = 'url("' + '__RUST__' + '"),repeating-linear-gradient(0deg,rgba(255,255,255,.09) 0 1px,rgba(0,0,0,.10) 1px 3px),linear-gradient(116deg,transparent 0 8%,rgba(255,255,255,.14) 14%,rgba(244,242,232,.62) 26%,rgba(255,255,255,.20) 34%,transparent 46%,transparent 58%,rgba(255,255,255,.36) 68%,rgba(86,86,82,.30) 80%,transparent 92%),linear-gradient(180deg,#F2F0E8 0%,#D2D0C6 24%,#A6A69C 50%,#5E5E58 74%,#CFCDBF 100%)';
const RUST_BG = 'url("' + '__RUST__' + '"),radial-gradient(ellipse at 38% 30%,rgba(150,60,26,.96),transparent 70%),radial-gradient(ellipse at 72% 74%,rgba(96,40,18,.92),transparent 64%),linear-gradient(165deg,#8A3818 0%,#6B2A10 42%,#7A2E17 68%,#4A1F12 100%)';

function mountForge(folium, container, ctx) {
  let disposed = false;
  let lyricTime = 0;
  const reduceMotion = () => !!S.reduce;
  const S = { ...DEFAULTS };
  const readSettings = () => {
    const v = ctx.getSettings ? ctx.getSettings() : {};
    for (const k of Object.keys(DEFAULTS)) if (v[k] !== undefined) S[k] = v[k];
    palette = PALETTES[S.palette] || PALETTES.standard;
    lut = LUTS[S.palette] || LUTS.standard;
    lutRgb = LUTS_RGB[S.palette] || LUTS_RGB.standard;
  };
  let palette = PALETTES.standard, lut = LUTS.standard, lutRgb = LUTS_RGB.standard;
  readSettings();

  container.style.position = 'absolute';
  container.style.inset = '0';
  container.style.overflow = 'hidden';

  const surfaceInfo = () => {
    try {
      return (typeof ctx.getSurface === 'function' ? (ctx.getSurface() || {}) : {});
    } catch (e) { return {}; }
  };

  const fx = document.createElement('canvas');
  fx.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';
  const fxctx = fx.getContext('2d');

  if (!fxctx) return () => {};
  const stage = document.createElement('div');
  stage.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:3;overflow:hidden';
  const vignette = document.createElement('div');
  vignette.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4';
  container.appendChild(fx); container.appendChild(stage); container.appendChild(vignette);

  let bloomCanvas = null, bloomCtx = null, bloomW = 1, bloomH = 1;
  try {
    bloomCanvas = document.createElement('canvas');
    bloomCtx = bloomCanvas.getContext('2d');
  } catch (e) { bloomCanvas = null; bloomCtx = null; }

  let W = 0, H = 0, DPR = 1;

  let PX = 1;
  function resizeBloom() {
    if (!bloomCanvas) return;

    bloomW = Math.max(1, Math.round(W * DPR * BLOOM_SCALE));
    bloomH = Math.max(1, Math.round(H * DPR * BLOOM_SCALE));
    bloomCanvas.width = bloomW;
    bloomCanvas.height = bloomH;
  }
  function resize(withEntry) {
    clearDecay();

    updateVignette();
    W = Math.max(1, container.clientWidth || window.innerWidth);
    H = Math.max(1, container.clientHeight || window.innerHeight);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    PX = clamp(Math.min(W / 1920, H / 1080), 0.6, 2.5);
    fx.width = Math.round(W * DPR); fx.height = Math.round(H * DPR);
    fxctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    resizeBloom();
    layoutCache.clear();

    const lineIdx = ctx.staticMode && ctx.staticLineIndex != null ? ctx.staticLineIndex : resolveLineIndex();
    finishing = false;
    pendingLineIndex = lineIdx;
    lastIndexSeen = lineIdx;
    shakeSpring.x = shakeSpring.y = shakeSpring.vx = shakeSpring.vy = 0;
    renderedLineIndex = -2;
    buildCurrent(!!withEntry);

    syncLateLine(pausedAt || performance.now());
    staticPainted = -999;
  }

  const layoutCache = new Map();
  function getLayout(line, idx) {
    if (!line) return null;
    const theme = ctx.getTheme ? ctx.getTheme() : { animationIntensity: 'normal' };
    const key = layoutCacheKey(line, theme.animationIntensity, 20, 100, H);
    if (layoutCache.has(key)) return layoutCache.get(key);
    const dw = buildDisplayWords(line, folium.lyrics && folium.lyrics.segmentWords, folium);
    const layout = buildLayout(line, dw, theme.animationIntensity, 20, 100, H, hashSeed(ctx.seed || String(line.startTime)));
    layout._energy = lineEnergy(line, idx > 0 ? ctx.lines[idx - 1] : null);
    if (layoutCache.size >= LAYOUT_CACHE_MAX) layoutCache.delete(layoutCache.keys().next().value);
    layoutCache.set(key, layout);
    return layout;
  }

  const currentBox = document.createElement('div');
  currentBox.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none';
  stage.appendChild(currentBox);

  const debris = [];
  const CRACK_BG = (() => {
    const rand = mulberry32(hashSeed('iron-time-crack'));
    const paths = [];
    for (let i = 0; i < 18; i++) {
      let x = rand() * 100, y = rand() * 30;
      let d = `M${x.toFixed(1)},${y.toFixed(1)}`;
      const steps = 2 + (rand() * 3 | 0);
      for (let s = 0; s < steps; s++) {
        x += (rand() - 0.5) * 44; y += 16 + rand() * 34;
        d += `L${x.toFixed(1)},${y.toFixed(1)}`;
      }
      paths.push(`<path d="${d}" fill="none" stroke="rgba(16,6,3,.9)" stroke-width="${(0.6 + rand() * 1.3).toFixed(1)}"/>`);
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">${paths.join('')}</svg>`;
    return 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '")';
  })();

  let currentLayout = null, renderedLineIndex = -2;

  let staticPainted = -999;
  const wordNodes = [];

  function clearBox(box) { box.replaceChildren(); }

  let themeForFont = ctx.getTheme ? ctx.getTheme() : {};

  const hostFontStack = (theme) => {
    try {
      if (folium.theme && typeof folium.theme.resolveFontStack === 'function') {
        const s = folium.theme.resolveFontStack(theme);
        if (typeof s === 'string' && s) return s;
      }
    } catch (e) { }
    return resolveFontStack(theme);
  };
  const hostFontWeight = (theme, fallback) => {
    try {
      if (folium.theme && typeof folium.theme.resolveFontWeight === 'function') {
        const w = folium.theme.resolveFontWeight(theme, fallback);
        if (typeof w === 'number' && Number.isFinite(w)) return w;
      }
    } catch (e) { }
    return resolveFontWeight(theme, fallback);
  };
  let fontStack = hostFontStack(themeForFont);
  let fontWeight = hostFontWeight(themeForFont, 700);

  stage.style.fontFamily = fontStack;

  function renderLayout(layout, box, withEntry) {
    clearBox(box);
    const nodes = [];
    if (!layout) return nodes;
    const fontScale = ctx.getDisplay ? ctx.getDisplay().lyricsFontScale : 1;
    const fit = layout._overlapFit != null ? layout._overlapFit : 1;
    const d = layout.densityScale * fit;
    const fontSize = clamp(W * 0.055 * d * fontScale, 40 * d * fontScale, 72 * d * fontScale);
    const spacing = computePartitaSpacing(layout);
    const faceBg = FACE_BG.replace('__RUST__', rustTexUrl());
    const rustBg = RUST_BG.replace('__RUST__', rustTexUrl());
    const glowK = clamp(S.glow, 0.2, 2);
    const energy = layout._energy != null ? layout._energy : 1;
    const r1 = (3 * glowK * FX_GAIN).toFixed(1), r2 = (9 * glowK * FX_GAIN).toFixed(1), r3 = (20 * glowK * FX_GAIN * (0.6 + energy * 0.4)).toFixed(1);

    const area = document.createElement('div');
    area.style.cssText = 'position:relative;width:100%;height:min(70vh,100%);display:flex;align-items:center;justify-content:center;padding:2rem;box-sizing:border-box;pointer-events:none';
    const line = document.createElement('div');
    line.dataset && (line.dataset.overlapFitLine = '');
    line.style.cssText = `display:flex;flex-direction:row-reverse;align-items:stretch;justify-content:center;width:100%;max-width:64rem;perspective:${layout.perspective}px;gap:2rem`;
    const column = document.createElement('div');
    column.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;padding-left:.75rem;padding-right:.75rem;min-width:3.8rem';
    const inner = document.createElement('div');
    inner.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-start';
    area.appendChild(line); line.appendChild(column); column.appendChild(inner);
    box.appendChild(area);

    layout.rows.forEach((row, ri) => {
      const sp = spacing[ri] || {};
      const rowEl = document.createElement('div');
      rowEl.dataset && (rowEl.dataset.overlapFitRow = '');
      const enter = withEntry && !reduceMotion();
      const entryY = enter ? (-30 - row.rowIndex * 6) * energy : 0;
      rowEl.style.cssText = `position:relative;display:inline-flex;flex-direction:row;align-items:center;justify-content:center;white-space:nowrap;line-height:1;min-width:auto;min-height:auto;padding:.2rem .5rem;align-self:${row.alignSelf || 'center'};transform:translate3d(${row.rowX}px,${(row.rowY + entryY).toFixed(2)}px,0) rotate(${row.rowRotate}deg);transform-origin:center;margin-bottom:${sp.marginBottom || (row.marginBottom + 'rem')}`;
      inner.appendChild(rowEl);

      row._el = rowEl;
      row._entrySpring = { x: entryY, v: 0, k: 180, c: 22 };
      row._entryActive = enter;

      row.words.forEach((w, wi) => {
        const holder = document.createElement('span');
        holder.style.cssText = `position:relative;display:inline-block;white-space:nowrap;transition:none;transform-origin:center;will-change:transform;font-weight:${fontWeight};line-height:${GLOW_LINE_HEIGHT};margin-inline-end:${(sp.wordMargins && sp.wordMargins[wi]) || WORD_GAP}`;
        holder.style.fontSize = `${fontSize}px`;

        const face = document.createElement('span');
        face.textContent = w.text;
        face.style.cssText = `position:relative;display:block;white-space:pre;color:transparent;-webkit-text-fill-color:transparent;background-image:${faceBg};background-size:184px 184px,auto,auto,auto,auto;background-blend-mode:soft-light,overlay,screen,normal;-webkit-background-clip:text;background-clip:text;filter:drop-shadow(0 1px 0 rgba(0,0,0,.85));opacity:1;transition:none;z-index:1`;
        const rust = document.createElement('span');
        rust.textContent = w.text;
        rust.style.cssText = `position:absolute;inset:0;white-space:pre;color:transparent;-webkit-text-fill-color:transparent;background-image:${rustBg};background-size:184px 184px,auto,auto,auto;background-blend-mode:overlay,normal,normal,normal;-webkit-background-clip:text;background-clip:text;opacity:.95;mix-blend-mode:normal;transition:none;z-index:2`;
        const edge = document.createElement('span');
        edge.textContent = w.text;
        edge.style.cssText = 'position:absolute;inset:0;white-space:pre;color:#4A1F12;clip-path:inset(64% 0 0 0);opacity:0;mix-blend-mode:multiply;transition:none;z-index:3';
        const ghost = document.createElement('span');
        ghost.textContent = w.text;
        ghost.style.cssText = 'position:absolute;inset:0;white-space:pre;color:#C4C2B8;opacity:0;transform:translate3d(-2px,1px,0);mix-blend-mode:screen;transition:none;z-index:4';
        const ghost2 = document.createElement('span');
        ghost2.textContent = w.text;
        ghost2.style.cssText = 'position:absolute;inset:0;white-space:pre;color:#FFE9A8;opacity:0;transform:translate3d(2px,-1px,0);mix-blend-mode:screen;transition:none;z-index:5';
        const heat = document.createElement('span');
        heat.textContent = w.text;
        heat.style.cssText = `position:absolute;inset:0;white-space:pre;color:${palette.hot};opacity:0;mix-blend-mode:screen;transition:none;z-index:6`;
        const glow = document.createElement('span');
        glow.textContent = w.text;
        glow.style.cssText = `position:absolute;inset:0;white-space:pre;color:transparent;opacity:0;mix-blend-mode:screen;transition:none;z-index:7;text-shadow:0 0 ${r1}px var(--heatColor),0 0 ${r2}px var(--heatColor),0 0 ${r3}px ${palette.red}`;
        holder.appendChild(face); holder.appendChild(rust); holder.appendChild(edge); holder.appendChild(ghost); holder.appendChild(ghost2);
        holder.appendChild(heat); holder.appendChild(glow);
        rowEl.appendChild(holder);

        nodes.push({
          w, holder, face, rust, edge, ghost, ghost2, heat, glow,
          scale: w.scale != null ? w.scale : 1,
          strain: makeSpring(200, 20),
          lift: makeSpring(200, 20),
          struck: false, strikeAt: 0, level: 1,
          tossY: 0,
          _cache: {},
        });
      });
    });
    return nodes;
  }

  function stepRowEntries(dt) {
    if (reduceMotion()) return;
    if (!currentLayout || !currentLayout.rows) return;
    for (const row of currentLayout.rows) {
      if (!row._el || !row._entrySpring || !row._entryActive) continue;
      stepSpring(row._entrySpring, 0, dt);
      row._el.style.transform = `translate3d(${row.rowX}px,${(row.rowY + row._entrySpring.x).toFixed(2)}px,0) rotate(${row.rowRotate}deg)`;
      if (Math.abs(row._entrySpring.x) < 0.15 && Math.abs(row._entrySpring.v) < 0.15) {
        row._entryActive = false;
      }
    }
  }

  const LEAD_MS = 280;
  function lastSungEnd(line) {
    if (!line) return -1;

    let e = 0;
    if (Array.isArray(line.words)) {
      for (const w of line.words) {
        const we = typeof w.end === 'number' ? w.end
                : (typeof w.endTime === 'number' ? w.endTime : 0);
        if (we > e) e = we;
      }
    }
    if (e <= 0 && typeof line.endTime === 'number' && isFinite(line.endTime)) e = line.endTime;
    return e;
  }

  function resolveLineIndex() {
    const hostIdx = ctx.getLineIndex();
    if (ctx.staticMode || !ctx.lines || !ctx.lines.length) return hostIdx;
    const t = lyricTime;
    if (!(t > 0)) return hostIdx;
    let pick = hostIdx;
    for (let i = hostIdx >= 0 ? hostIdx + 1 : 0; i < ctx.lines.length; i++) {
      const nx = ctx.lines[i];
      if (!nx || typeof nx.startTime !== 'number') break;
      if (t < nx.startTime) {
        const pe = lastSungEnd(ctx.lines[i - 1]);
        if (pe > 0 && t >= pe && t + LEAD_MS / 1000 >= nx.startTime) pick = i;
        break;
      }
      pick = i;
    }
    return pick;
  }

  function buildCurrent(withEntry = true) {
    const idx = ctx.staticMode && ctx.staticLineIndex != null ? ctx.staticLineIndex : resolveLineIndex();
    if (idx === renderedLineIndex) return;
    renderedLineIndex = idx;
    currentLayout = idx >= 0 ? getLayout(ctx.lines[idx], idx) : null;
    wordNodes.length = 0;
    if (!currentLayout) return;
    if (currentLayout._overlapFit == null) {
      renderLayout(currentLayout, currentBox, false);
      const area = currentBox.firstChild;
      const line = area && area.querySelector ? area.querySelector('[data-overlap-fit-line]') : null;
      const fit = (area && line) ? measureOverlapFit(area, line) : 1;
      currentLayout._overlapFit = fit < 0.995 ? fit : 1;
    }
    wordNodes.push(...renderLayout(currentLayout, currentBox, withEntry));
  }

  const RUST_HOLD = 0.28;
  const RUST_FALL = 0.55;
  const RUST_MAX = 0.92;
  const RUST_FACE_DARKEN = 0.6;

  const DECAY_MS = 1300;
  const TOSS_DOWN = 200;
  const T_RISE = 0.4;
  const TOSS_G = 1400;
  const TOSS_V0 = 300;
  const SHARD_AT = 0.00, SHARD_SPAN = 0.36;
  const FALL_AT = 0.22, FALL_SPAN = 0.50;
  const DUST_AT = 0.60, DUST_SPAN = 0.40;
  const FALL_START_MS = (RUST_HOLD + RUST_FALL) * 1000;

  const seg = (u, at, span) => clamp((u - at) / span, 0, 1);
  function fallPhases(sinceEndMs) {
    const u = clamp((sinceEndMs - FALL_START_MS) / DECAY_MS, 0, 1);
    return {
      u,
      shard: seg(u, SHARD_AT, SHARD_SPAN),
      fall: seg(u, FALL_AT, FALL_SPAN),
      dust: seg(u, DUST_AT, DUST_SPAN),
    };
  }
  function ensureFallCrack(n) {
    if (n.fallCrack) return n.fallCrack;
    const cr = document.createElement('span');
    cr.textContent = n.w.text;
    cr.style.cssText = `position:absolute;inset:0;white-space:pre;color:transparent;-webkit-text-fill-color:transparent;background-image:${CRACK_BG};background-size:100% 100%;-webkit-background-clip:text;background-clip:text;opacity:0;transition:none;z-index:8`;
    n.holder.appendChild(cr); n.fallCrack = cr;
    return cr;
  }
  const SHARD_PIECE = [
    'polygon(0% 0%, 46% 0%, 40% 44%, 0% 38%)',
    'polygon(46% 0%, 100% 0%, 100% 30%, 62% 40%, 40% 44%)',
    'polygon(0% 38%, 40% 44%, 48% 100%, 0% 100%)',
    'polygon(40% 44%, 62% 40%, 100% 30%, 100% 78%, 66% 100%, 48% 100%)',
    'polygon(62% 40%, 100% 78%, 66% 100%)',
  ];
  function ensureShards(n) {
    if (n.shards) return n.shards;
    const faceBg = FACE_BG.replace('__RUST__', rustTexUrl());
    const rustBg = RUST_BG.replace('__RUST__', rustTexUrl());
    const rand = mulberry32(hashSeed(n.w.text + '|shard|' + (n.w.start || 0)));
    const shards = SHARD_PIECE.map(clip => {
      const sp = document.createElement('span');
      sp.textContent = n.w.text;
      sp.style.cssText = `position:absolute;inset:0;white-space:pre;color:transparent;-webkit-text-fill-color:transparent;background-image:${rustBg},${faceBg};background-size:184px 184px,184px 184px,auto,auto,auto,auto,auto,auto,auto;background-blend-mode:overlay,soft-light,overlay,screen,normal,overlay,normal,normal;-webkit-background-clip:text;background-clip:text;clip-path:${clip};opacity:0;transition:none;z-index:9;will-change:transform,opacity`;
      n.holder.appendChild(sp);
      return {
        el: sp,
        dx: (rand() - 0.5) * 16, dy: (rand() - 0.5) * 12,
        rot: (rand() - 0.5) * 26,
        rustBias: 0.9 + rand() * 0.1, seed: rand() * 1000,
      };
    });
    n.shards = shards;
    return shards;
  }
  function applyWordFall(n, sinceEndMs, now, paint) {
    const ph = fallPhases(sinceEndMs);

    const ss = (el, prop, val) => {
      if (!paint) return;
      el.style[prop] = val;
      if (prop === 'opacity' && n._cache) {
        const k = el === n.face ? 'fo' : el === n.rust ? 'ro' : el === n.edge ? 'eo'
                : el === n.heat ? 'heo' : el === n.glow ? 'go' : null;
        if (k) n._cache[k] = val;
      }
    };
    const baseX = n.w.x || 0, baseY = (n.w.y || 0) + (n.lift ? n.lift.x : 0) + (n.tossY || 0);
    const baseScale = n.strain ? Math.max(0.5, n.strain.x) : 1;
    const baseRot = n.w.rotate || 0;

    if (ph.shard <= 0) {
      n.fallDebrisFired = false; n.fallDustFired = false; n.fallDustBurst2 = false;
      n.fallHidden = false;
      ss(n.holder, 'opacity', '1');
      ss(n.holder, 'transform', `translate3d(${baseX}px,${baseY}px,0) scale(${baseScale.toFixed(4)}) rotate(${baseRot}deg)`);
      if (n.shards) n.shards.forEach(s => { ss(s.el, 'opacity', '0'); });
      if (n.fallCrack) ss(n.fallCrack, 'opacity', '0');
      return;
    }

    const traceFade = 1 - ph.fall;
    const cr = ensureFallCrack(n);
    ss(cr, 'opacity', (Math.min(1, ph.shard * 1.3) * 0.9 * traceFade).toFixed(3));
    ss(n.edge, 'opacity', (Math.max(parseFloat(n.edge.style.opacity) || 0, ph.shard * 0.45) * traceFade).toFixed(3));
    ss(n.holder, 'opacity', '1');
    ss(n.holder, 'transform', `translate3d(${baseX}px,${baseY}px,0) scale(${baseScale.toFixed(4)}) rotate(${baseRot}deg)`);

    const shards = ensureShards(n);
    const reveal = Math.min(1, ph.shard * 1.6);
    const wholeFade = 1 - reveal;
    const rustedFace = 0.55 + 0.45 - RUST_FACE_DARKEN;
    ss(n.face, 'opacity', (wholeFade * rustedFace).toFixed(3));
    ss(n.rust, 'opacity', (wholeFade * RUST_MAX).toFixed(3));
    ss(n.heat, 'opacity', '0'); ss(n.glow, 'opacity', '0');

    shards.forEach(s => {
      const jitter = Math.sin(s.seed + now * 0.02) * (1 - ph.fall) * 2;
      const dx = s.dx * (0.35 + ph.fall * 1.6) + jitter;
      const dy = s.dy * (0.35 + ph.fall * 1.6) + ph.fall * ph.fall * (18 + (s.seed % 14));
      const rot = s.rot * (0.3 + ph.fall * 1.5);
      const shrink = 1 - ph.fall * 0.28 - ph.dust * 0.45;
      ss(s.el, 'transform', `translate3d(${dx.toFixed(2)}px,${dy.toFixed(2)}px,0) rotate(${rot.toFixed(2)}deg) scale(${Math.max(0.05, shrink).toFixed(3)})`);
      const rusten = (ph.fall * 0.35 + ph.dust * 0.5) * s.rustBias;
      ss(s.el, 'filter', rusten > 0.001 ? `brightness(${(1 - rusten * 0.45).toFixed(3)}) sepia(${Math.min(1, rusten).toFixed(3)}) saturate(${(1 + rusten * 0.5).toFixed(3)})` : 'none');
      ss(s.el, 'opacity', (reveal * (1 - ph.dust)).toFixed(3));
    });

    if (ph.fall >= FALL_AT && !n.fallDebrisFired) {
      n.fallDebrisFired = true;
      spawnDebris([{ n, seed: n.fallSeed != null ? n.fallSeed : (n.fallSeed = Math.random() * 1000) }]);
    }
    if (ph.dust >= 0.15 && !n.fallDustFired) {
      n.fallDustFired = true;
      spawnFineDust(n, false, now);
    }
    if (ph.dust >= 0.55 && !n.fallDustBurst2) {
      n.fallDustBurst2 = true;
      spawnFineDust(n, true, now);
    }
    if (ph.dust >= 1 && !n.fallHidden) {
      n.fallHidden = true;
      ss(n.holder, 'opacity', '0');
      ss(n.face, 'opacity', '0'); ss(n.rust, 'opacity', '0'); ss(n.edge, 'opacity', '0');
      ss(n.heat, 'opacity', '0'); ss(n.glow, 'opacity', '0');
      if (n.fallCrack) ss(n.fallCrack, 'opacity', '0');
      shards.forEach(s => { ss(s.el, 'opacity', '0'); });
    }
  }
  function spawnFineDust(n, tail, now) {
    if (reduceMotion()) return;
    const rand = Math.random;
    const rustColors = [[150, 60, 26], [96, 34, 16], [58, 28, 20], [180, 74, 24]];
    const rect = n.holder.getBoundingClientRect && n.holder.getBoundingClientRect();
    const cr = container.getBoundingClientRect();
    const cx = rect ? (rect.left - cr.left + rect.width / 2) : (W / 2 + (n.w.x || 0));
    const cy = rect ? (rect.top - cr.top + rect.height / 2) : (H / 2 + (n.w.y || 0));
    if (!tail && n.level >= 2 && S.shock > 0) {
      if (rect) {
        shocks.push({
          x: cx,
          y: rect.top - cr.top + rect.height - 2,
          at: now != null ? now : performance.now(),
          level: 1, punct: false,
          rings: [{ delay: 0, scale: 0.35, life: 260, tint: 0.5 }],
          energy: currentLayout && currentLayout._energy != null ? currentLayout._energy : 1,
          seed: hashSeed('dust|' + (n.w.start || 0)) * 0.001,
        });
      }
    }
    const count = Math.round((tail ? 18 + rand() * 12 : 12 + rand() * 8) * DUST_GAIN);
    for (let k = 0; k < count; k++) {
      const ang = rand() * Math.PI * 2;
      const sp = (tail ? 8 + rand() * 30 : 18 + rand() * 70) * PX;
      debris.push({
        x: cx + (rand() - 0.5) * (tail ? 36 : 24) * PX, y: cy + (rand() - 0.5) * (tail ? 26 : 18) * PX,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (tail ? 10 : 16) * PX,
        age: 0, life: tail ? 1.4 + rand() * 1.2 : 1.2 + rand() * 1.0,
        size: (tail ? 0.4 + rand() * 0.7 : 0.65 + rand() * 1.25) * PX,
        rot: rand() * 6.28, vr: (rand() - 0.5) * 7,
        color: rustColors[(rand() * rustColors.length) | 0],
        groundY: H * 0.92, dust: true,
      });
    }
  }
  function spawnDebris(nodeStates) {
    if (reduceMotion()) return;
    const rand = Math.random;
    const rustColors = [[150, 60, 26], [96, 34, 16], [58, 28, 20], [180, 74, 24]];
    const cr = container.getBoundingClientRect();
    nodeStates.forEach(st => {
      const n = st.n;
      const rect = n.holder.getBoundingClientRect && n.holder.getBoundingClientRect();
      const cx = rect ? (rect.left - cr.left + rect.width / 2) : (W / 2 + (n.w.x || 0));
      const cy = rect ? (rect.top - cr.top + rect.height / 2) : (H / 2 + (n.w.y || 0));
      const count = 9 + (rand() * 7 | 0);
      for (let k = 0; k < count; k++) {
        const ang = rand() * Math.PI * 2;
        const sp = (30 + rand() * 96) * PX;
        debris.push({
          x: cx + (rand() - 0.5) * 22 * PX, y: cy + (rand() - 0.5) * 18 * PX,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 36 * PX,
          age: 0, life: 0.82 + rand() * 0.7,
          size: (1.1 + rand() * 2.4) * PX, rot: rand() * 6.28, vr: (rand() - 0.5) * 7,
          color: rustColors[(rand() * rustColors.length) | 0],
          groundY: H * 0.92,
        });
      }
    });
  }

  function clearDecay() {
    debris.length = 0;

    particles.length = 0;
    shocks.length = 0;
    groundShockAt = 0;
  }

  const SETTLE_WINDOW_MS = 150;
  let pendingLineIndex = -2;
  let finishing = false;
  let finishStart = 0;
  let finishFromMs = 0;
  let finishTargetMs = 0;
  let finishSpeed = 1;

  let switchHardAt = 0;
  const HARD_SWITCH_MS = 180;
  const LATE_STRIKE = 0.24;

  function lineAnimEndMs(line) {
    if (!line) return -Infinity;
    let lastEnd = typeof line.endTime === 'number' ? line.endTime : 0;
    if (Array.isArray(line.words)) {
      for (const w of line.words) {
        const e = typeof w.end === 'number' ? w.end
                : (typeof w.endTime === 'number' ? w.endTime : lastEnd);
        if (e > lastEnd) lastEnd = e;
      }
    }

    const ms = lastEnd * 1000 + FALL_START_MS + DECAY_MS;
    return isFinite(ms) ? ms : -Infinity;
  }

  function finishVirtualMs(now) {
    return finishFromMs + (now - finishStart) * finishSpeed;
  }

  function clearLineCallbacks() {
    wordNodes.length = 0;
    debris.length = 0;
  }

  function syncLateLine(nowAt) {
    if (ctx.staticMode) return;
    const base = nowAt || performance.now();
    wordNodes.forEach(n => {
      if (lyricTime - n.w.start > LATE_STRIKE && !n.struck) {
        n.struck = true;
        n.strikeAt = base - Math.max(0, (lyricTime - n.w.start) * 1000);
        n.fallDebrisFired = false;
        n.fallDustFired = false;
        n.fallDustBurst2 = false;
        n.fallHidden = false;
      }
    });
  }

  function requestLineSwitch(idx) {
    if (ctx.staticMode) {
      if (idx !== lastIndexSeen) {
        lastIndexSeen = idx; pendingLineIndex = idx; finishing = false;
        clearLineCallbacks(); buildCurrent();
      }
      return;
    }
    if (idx === pendingLineIndex) return;
    pendingLineIndex = idx;
    if (idx === renderedLineIndex) { finishing = false; return; }

    const rush = !ctx.staticMode && idx > ctx.getLineIndex();
    finishFromMs = lyricTime * 1000;
    finishTargetMs = lineAnimEndMs(ctx.lines[renderedLineIndex]);

    if (finishTargetMs > finishFromMs) finishTargetMs = Math.min(finishTargetMs, finishFromMs + 4000);
    finishSpeed = Math.max(1, (finishTargetMs - finishFromMs) / (rush ? 90 : SETTLE_WINDOW_MS));
    finishStart = performance.now();
    if (!finishing) switchHardAt = finishStart + HARD_SWITCH_MS;
    finishing = true;
  }

  function tryLineSwitch(now) {
    if (!finishing) return;

    if (now < switchHardAt && finishVirtualMs(now) < finishTargetMs) return;
    finishing = false;
    if (pendingLineIndex === renderedLineIndex) return;
    clearLineCallbacks();
    lastIndexSeen = pendingLineIndex;
    buildCurrent();
    syncLateLine();
  }

  function paintTimeFor(now) {
    return finishing ? finishVirtualMs(now) / 1000 : lyricTime;
  }

  const particles = [], shocks = [];
  const SHAKE_K = 260, SHAKE_C = 22, SHAKE_IMP = 55;
  const shakeSpring = { x: 0, y: 0, vx: 0, vy: 0 };
  let flashTimes = [], lastFrame = performance.now();
  let lastIndexSeen = -2;
  let lastPaused = false;
  let groundShockAt = 0, groundShockX = 0;

  function sparkRgb(t) {
    return lutRgb[clamp(Math.floor(t * 255), 0, 255)];
  }
  function durGain(dur) {
    return clamp(0.72 + clamp(dur / 0.30, 0.5, 1.8) * 0.30, 0.72, 1.26);
  }
  function groundFor() {
    return H * 0.9;
  }
  function spawnSecondary(p) {
    for (let i = 0, n = (2 + (p._rand() * 3 | 0)) * FX_GAIN; i < n && particles.length < MAX_PARTICLES; i++) {
      const ang = Math.PI / 2 + (p._rand() - 0.5) * 100 * RAD;
      const v = (60 + p._rand() * 120) * 0.9 * PX;
      particles.push({
        x: p.x, y: p.y - 1, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
        age: 0, life: (0.22 + p._rand() * 0.28) * S.life,
        size: (0.7 + p._rand() * 0.7) * PX, layer: 0, shape: 'debris',
        rot: p._rand() * 6.28, vr: (p._rand() * 2 - 1) * 8,
        verts: [0.7, 1.1, 0.8], secondary: true, groundY: p.groundY, _rand: p._rand,
      });
    }
  }
  function spawnBranches(p) {
    const rnd = p._rand;
    const n = p.variant === 1 ? 3 + (rnd() < 0.5 ? 0 : 1) : 2;
    const baseAng = Math.atan2(p.vy, p.vx);
    const baseSpd = Math.hypot(p.vx, p.vy);
    const remain = Math.max(0.16, (p.life - p.age) * 1.2);
    for (let k = 0; k < n && particles.length < MAX_PARTICLES; k++) {
      const off = (k / (n - 1) - 0.5) * 2 * (0.22 + rnd() * 0.32);
      const ang = baseAng + off + (rnd() - 0.5) * 0.18;
      const spd = baseSpd * (0.80 + rnd() * 0.40);
      particles.push({
        x: p.x, y: p.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        age: 0, life: remain * (0.80 + rnd() * 0.35),
        g: p.g, size: p.size * (0.60 + rnd() * 0.28),
        layer: p.layer, shape: 'trail', rot: rnd() * 6.283, vr: (rnd() * 2 - 1) * 5,
        variant: 0, seed: rnd() * 1000, verts: [1, 1, 1],
        secondary: false, branched: true, groundY: p.groundY, _rand: p._rand,
      });
    }
    p.age = p.life;
  }
  function emitSparks(node, now) {
    if (reduceMotion()) return;
    const r = node.holder.getBoundingClientRect();
    const cr = container.getBoundingClientRect();
    const rand = mulberry32(hashSeed(String(node.w.start) + node.w.text));
    const dg = durGain(node.w.end - node.w.start);
    const groundY = groundFor();
    const ep = {
      x: r.left - cr.left + r.width * 0.56 + (rand() * 2 - 1) * 0.12 * r.width * (0.35 + S.asym * 0.65) + S.asym * 0.05 * r.width,
      y: r.top - cr.top + r.height * 0.82 + (rand() * 2 - 1) * 0.08 * r.height * (0.35 + S.asym * 0.65),
    };
    const mult = S.density * (0.75 + dg * 0.25) * FX_GAIN;
    const baseCount = node.level === 1 ? (8 + rand() * 6)
                    : node.level === 2 ? (28 + rand() * 20)
                    : (56 + rand() * 28);
    const count = Math.min(Math.max(0, Math.round(baseCount * mult * SPARK_GAIN * 0.81)), Math.max(0, MAX_PARTICLES - particles.length));
    for (let i = 0; i < count; i++) {
      const lq = rand(); const layer = lq < 0.3 ? 0 : lq < 0.85 ? 1 : 2;
      const shape = chooseShape(rand());

      const up = rand() < 0.75;
      let ang;
      if (up) ang = -Math.PI / 2 + (rand() * 2 - 1) * 60 * RAD;
      else if (rand() < 0.35) ang = (rand() < 0.5 ? 18 : 162) * RAD + (rand() - 0.5) * 18 * RAD;
      else ang = Math.PI / 2 + (rand() * 2 - 1) * 70 * RAD - (10 + rand() * 15) * RAD;
      const base = 180 + 340 * Math.pow(rand(), 1.8);
      const layerSpeed = layer === 0 ? 0.6 : layer === 2 ? 1.3 : 1;

      const solid = shape === 'debris' || shape === 'scale';

      const v = base * S.speed * layerSpeed * (up ? 3.2 : 1) * (solid ? 0.86 : 1) * PX;
      const size = (layer === 0 ? 0.6 + rand() * 0.6 : layer === 2 ? 2.5 + rand() * 1.5 : 1.2 + rand() * 1.3) * (solid ? 1.22 : 1) * PX;
      const vn = 3 + (rand() * 3 | 0), verts = [];
      for (let k = 0; k < vn; k++) verts.push(0.55 + rand() * 0.75);

      const vy0 = Math.sin(ang) * v;

      const variant = shape === 'cross'
        ? (rand() < 0.55 ? 2 : rand() < 0.5 ? 0 : 1)
        : (rand() < 0.70 ? 0 : 1);
      particles.push({
        x: ep.x, y: ep.y, vx: Math.cos(ang) * v, vy: vy0,
        age: 0,

        life: (0.35 + rand() * 0.75) * S.life * (layer === 0 ? 0.72 : 1) * (up ? 1.65 : 1.05),
        g: vy0 < 0 ? S.gravity * 3 * PX : null,
        size, layer, shape, rot: rand() * Math.PI * 2, vr: (rand() * 2 - 1) * (shape === 'scale' ? 4 : 8),
        variant, seed: rand() * 1000,
        verts, secondary: false, groundY, _rand: rand,
      });
    }
    if (S.shock > 0 && (node.level >= 2 || node.w.isLast)) {
      const anchorX = Math.round(ep.x);
      const anchorY = Math.round(ep.y + 8 - (node.tossY || 0));
      const rings = node.level === 3
        ? [{ delay: 0,    scale: 1.0, life: 240, tint: 0 },
           { delay: 0.04, scale: 2.6, life: 520, tint: 1 }]
        : [{ delay: 0, scale: 1.0, life: 320, tint: node.level === 2 ? 0 : 0.5 }];
      shocks.push({
        x: anchorX, y: anchorY, at: now, level: node.level, punct: node.w.isLast,
        rings, energy: currentLayout && currentLayout._energy != null ? currentLayout._energy : 1,
        seed: hashSeed(String(node.w.start) + node.w.text) * 0.001,
      });
    }
    if (S.shake > 0) {
      const amp0 = node.level === 1 ? 0.8 : node.level === 2 ? 2.5 : 5;
      const amp = Math.max(0.8, amp0 * (0.7 + dg * 0.3)) * FX_GAIN;
      const jitter = (rand() * 2 - 1) * (0.4 + S.asym * 0.6);
      shakeSpring.vx += amp * S.shake * jitter * SHAKE_IMP * 0.76;
      shakeSpring.vy += amp * S.shake * -SHAKE_IMP;
    }
    if (node.level >= 2) {
      groundShockAt = now;
      groundShockX = ep.x;
    }
    if (S.peak > 0 && node.level >= 2) {
      flashTimes = flashTimes.filter(t => now - t < 1000);
      if (!(S.flashLimit && flashTimes.length >= 3)) {
        flashTimes.push(now);
      }
    }
  }

  function drawAmbientSpawn() {
    if (!S.ambient || reduceMotion() || particles.length >= MAX_PARTICLES) return;
    const ambientEnergy = currentLayout && currentLayout._energy != null ? currentLayout._energy : 1;
    if (Math.random() > 0.08 * ambientEnergy) return;
    const stops = AMBIENT_OVERRIDES[S.palette] || palette.stops;
    const cHex = stops[1 + (Math.random() * 3 | 0)];
    const rgb = [
      parseInt(cHex.slice(1, 3), 16),
      parseInt(cHex.slice(3, 5), 16),
      parseInt(cHex.slice(5, 7), 16),
    ];
    particles.push({
      x: Math.random() * W,
      y: H * (0.35 + Math.random() * 0.55),
      vx: (Math.random() - 0.5) * 10 * PX,
      vy: (-6 - Math.random() * 10) * PX,
      age: 0, life: 2.5 + Math.random() * 2.5,
      size: (0.4 + Math.random() * 0.5) * PX,
      layer: 0, shape: 'debris',
      rot: 0, vr: (Math.random() - 0.5) * 0.4,
      verts: [1, 1, 1], secondary: false,
      ambient: true, groundY: Infinity, color: rgb,
      _rand: Math.random,
    });
  }

  function drawGroundShock(now) {
    if (!groundShockAt) return;
    const gAge = now - groundShockAt;
    if (gAge > 380) { groundShockAt = 0; return; }
    const u = gAge / 380;
    const alpha = (1 - u) * 0.55;
    const y = H * 0.9;
    const r = 80 + u * 240;
    const grad = fxctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, `rgba(255,190,110,${alpha.toFixed(3)})`);
    grad.addColorStop(0.5, `rgba(255,150,70,${(alpha * 0.4).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(255,120,50,0)');
    fxctx.save();
    fxctx.translate(groundShockX, y);
    fxctx.scale(1, 0.15);
    fxctx.fillStyle = grad;
    fxctx.beginPath();
    fxctx.arc(0, 0, r, 0, Math.PI * 2);
    fxctx.fill();
    fxctx.restore();
  }

  function applyBloom() {
    if (!S.bloom || !bloomCtx || reduceMotion()) return;
    if (!bloomW || !bloomH) return;
    bloomCtx.clearRect(0, 0, bloomW, bloomH);
    bloomCtx.filter = `blur(${(6 * DPR).toFixed(2)}px)`;
    bloomCtx.drawImage(fx, 0, 0, fx.width, fx.height, 0, 0, bloomW, bloomH);
    bloomCtx.filter = 'none';
    fxctx.globalCompositeOperation = 'lighter';
    fxctx.globalAlpha = S.bloomStrength;
    fxctx.drawImage(bloomCanvas, 0, 0, bloomW, bloomH, 0, 0, W, H);
    fxctx.globalAlpha = 1;
    fxctx.globalCompositeOperation = 'source-over';
  }

  function drawFx(now, dt) {
    fxctx.clearRect(0, 0, W, H);
    drawAmbientSpawn();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        if ((p.shape === 'scale' || p.shape === 'debris') && !p.secondary && !p.ambient && p.y >= p.groundY - 12 && p._rand() < (p.shape === 'scale' ? 0.16 : 0.11)) spawnSecondary(p);
        particles.splice(i, 1); continue;
      }
      const drag = Math.pow(0.985, dt * 60);
      p.vx *= drag; p.vy *= drag;
      const g = p.ambient ? -8 * PX : (p.g != null ? p.g : S.gravity * PX);
      p.vy += g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += (p.vr || 0) * dt;
      if (p.y > p.groundY) { p.y = p.groundY; p.vy *= -0.18; p.vx *= 0.62; p.vr *= 0.5; }
      const u = p.age / p.life;
      if (p.shape === 'cross' && p.variant !== 2 && !p.branched && u >= BRANCH_AT) { spawnBranches(p); continue; }

      const col = p.ambient ? p.color : sparkRgb(Math.pow(u, 1.1));
      const alpha = p.ambient
        ? Math.pow(1 - u, 1.5) * 0.5
        : clamp(Math.pow(1 - u, 1.1) * (p.layer === 0 ? 0.78 : 1) * 1.20, 0, 1);
      if (alpha > 0.01) {
        const additive = p.shape === 'trail' || p.shape === 'cross';
        if (additive) fxctx.globalCompositeOperation = 'lighter';
        drawSparkShape(fxctx, p, u, col, alpha);
        if (additive) fxctx.globalCompositeOperation = 'source-over';
      }
    }
    for (let i = debris.length - 1; i >= 0; i--) {
      const p = debris[i];
      p.age += dt;
      if (p.age >= p.life) { debris.splice(i, 1); continue; }
      const drag = Math.pow(0.98, dt * 60);
      p.vx *= drag; p.vy = p.vy * drag + S.gravity * 0.6 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.y > p.groundY) { p.y = p.groundY; p.vy *= -0.15; p.vx *= 0.6; }
      const u = p.age / p.life;
      const a = Math.pow(1 - u, 1.2);
      const [r, g, b] = p.color;
      const sz = p.size * (1 - u * 0.4);
      fxctx.save(); fxctx.translate(p.x, p.y); fxctx.rotate(p.rot);
      if (p.dust) {
        fxctx.shadowBlur = 4;
        fxctx.shadowColor = `rgba(${r},${g},${b},${(a * 0.6).toFixed(3)})`;
      }
      fxctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      if (p.vr > 0) {
        fxctx.beginPath(); fxctx.moveTo(-sz, -sz * 0.6); fxctx.lineTo(sz, -sz * 0.3);
        fxctx.lineTo(sz * 0.4, sz); fxctx.closePath(); fxctx.fill();
      } else {
        fxctx.fillRect(-sz, -sz * 0.7, sz * 2, sz * 1.4);
      }
      fxctx.restore();
    }
    fxctx.globalAlpha = 1;
    drawGroundShock(now);

    const SHOCK_RING_N = 64;
    for (let i = shocks.length - 1; i >= 0; i--) {
      const sh = shocks[i];
      const age = now - sh.at;

      if (age >= 0 && age < 90) {
        const bu = age / 90;
        const coreK = sh.level === 3 ? 1.4 : sh.level === 2 ? 1.0 : 0.6;
        const br = (10 + bu * 30) * coreK;
        const bg = fxctx.createRadialGradient(sh.x, sh.y, 0, sh.x, sh.y, br);
        bg.addColorStop(0, `rgba(255,252,245,${((1 - bu) * coreK * 0.95).toFixed(3)})`);
        bg.addColorStop(0.45, `rgba(255,210,140,${((1 - bu) * coreK * 0.55).toFixed(3)})`);
        bg.addColorStop(1, 'rgba(255,140,50,0)');
        fxctx.fillStyle = bg;
        fxctx.beginPath(); fxctx.arc(sh.x, sh.y, br, 0, Math.PI * 2); fxctx.fill();
        if (age < 60) {
          const cu = age / 60;
          const len = (18 + cu * 22) * coreK;
          const ca = (1 - cu) * 0.9 * coreK;
          fxctx.strokeStyle = `rgba(255,248,235,${ca.toFixed(3)})`;
          fxctx.lineWidth = 2.2 * (1 - cu) + 0.6;
          fxctx.beginPath();
          fxctx.moveTo(sh.x - len, sh.y); fxctx.lineTo(sh.x + len, sh.y);
          fxctx.moveTo(sh.x, sh.y - len * 0.75); fxctx.lineTo(sh.x, sh.y + len * 0.75);
          fxctx.stroke();
        }
      }

      const maxR = Math.min(W, H) * SHOCK_MAX_R;
      const shEnergy = sh.energy != null ? sh.energy : 1;
      for (let k = 0; k < sh.rings.length; k++) {
        const ring = sh.rings[k];
        const local = age - ring.delay * 1000;
        if (local < 0 || local > ring.life) continue;

        const u = local / ring.life;
        const preU = Math.min(1, local / 30);
        const compression = 0.6 + 0.4 * (preU * preU * (3 - 2 * preU));
        const ease = 1 - Math.pow(1 - u, 2.4);
        const baseR = Math.min(maxR, (26 + wScale(sh.level) * 96 * S.shock) * SHOCK_GAIN * ring.scale * shEnergy);
        const rx = (8 + ease * baseR) * compression;
        const ry = (sh.punct ? rx / 1.7 : rx * 0.36) * (k === 0 ? 1 : 0.82);

        const pseed = (sh.seed || 0) + k * 1.7;
        fxctx.beginPath();
        for (let j = 0; j <= SHOCK_RING_N; j++) {
          const th = j / SHOCK_RING_N * Math.PI * 2;
          const perturb = 1 + 0.06 * Math.sin(3 * th + pseed) + 0.03 * Math.sin(7 * th + pseed * 1.3);
          const px = sh.x + Math.cos(th) * rx * perturb;
          const py = sh.y + Math.sin(th) * ry * perturb;
          if (j === 0) fxctx.moveTo(px, py); else fxctx.lineTo(px, py);
        }
        fxctx.closePath();

        let col;
        if (ring.tint === 0) {
          const tt = Math.min(1, u * 0.5);
          col = [255, Math.round(248 - tt * 54), Math.round(231 - tt * 170)];
        } else if (ring.tint === 1) {
          const tt = Math.min(1, u * 0.8);
          col = [Math.round(255 - tt * 76), Math.round(194 - tt * 158), Math.round(61 - tt * 51)];
        } else {
          col = sparkRgb(1 - Math.min(1, u * 0.4));
        }

        const fadeIn = Math.min(1, u * 7);
        const fadeOut = Math.pow(1 - u, 2.1);
        const a = fadeIn * fadeOut * (sh.level === 1 ? 0.32 : 0.78)
          * clamp(S.glow, 0.2, 1.6) * (k === 0 ? 1 : 0.6);

        if (k > 0 && u > 0.5) {
          const dash = 5 + u * 11;
          fxctx.setLineDash([dash, 7 + (1 - u) * 22]);
          fxctx.lineDashOffset = u * 60;
        } else {
          fxctx.setLineDash([]);
        }

        fxctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(3)})`;
        fxctx.lineWidth = Math.max(0.5, (2.6 - u * 2.0) * (sh.level === 3 ? 1.3 : 1) * (k === 0 ? 1 : 0.7));
        fxctx.shadowBlur = k === 0 ? (14 * (1 - u) * (sh.level === 3 ? 1.6 : 1)) : (6 * (1 - u));
        fxctx.shadowColor = `rgba(${col[0]},${col[1]},${col[2]},${(a * 0.9).toFixed(3)})`;
        fxctx.stroke();
      }
      fxctx.setLineDash([]);
      fxctx.shadowBlur = 0;

      if (!sh.burst && age > 260 && sh.level >= 2) {
        sh.burst = true;
        const n = sh.level === 3 ? 14 : 8;
        const ringR = Math.min(maxR, (26 + wScale(sh.level) * 96 * S.shock) * SHOCK_GAIN * shEnergy);
        for (let k = 0; k < n && particles.length < MAX_PARTICLES; k++) {
          const ang = (k / n) * Math.PI * 2 + Math.random() * 0.4;
          const rr = ringR * 0.7;
          particles.push({
            x: sh.x + Math.cos(ang) * rr,
            y: sh.y + Math.sin(ang) * rr * (sh.punct ? 0.6 : 0.36),
            vx: Math.cos(ang) * (40 + Math.random() * 70),
            vy: Math.sin(ang) * (40 + Math.random() * 70) - 30,
            age: 0, life: 0.35 + Math.random() * 0.45,
            size: 0.8 + Math.random() * 1.1, layer: 0, shape: 'debris',
            rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 6,
            verts: [0.7, 1.1, 0.8], secondary: true,
            groundY: sh.y + 400, _rand: () => Math.random(),
          });
        }
      }

      if (age > 560) shocks.splice(i, 1);
    }
    fxctx.globalAlpha = 1;

    let dt2 = Math.min(dt, 0.05);
    const steps = Math.max(1, Math.ceil(dt2 / 0.016));
    const h = dt2 / steps;
    for (let i = 0; i < steps; i++) {
      shakeSpring.vx += (-SHAKE_K * shakeSpring.x - SHAKE_C * shakeSpring.vx) * h;
      shakeSpring.vy += (-SHAKE_K * shakeSpring.y - SHAKE_C * shakeSpring.vy) * h;
      shakeSpring.x += shakeSpring.vx * h; shakeSpring.y += shakeSpring.vy * h;
    }
    if (reduceMotion()) { shakeSpring.x = shakeSpring.y = shakeSpring.vx = shakeSpring.vy = 0; }
    stage.style.transform = `translate3d(${shakeSpring.x.toFixed(2)}px,${shakeSpring.y.toFixed(2)}px,0)`;

    applyBloom();
  }

  let _lastStageFilter = '';
  let pausedAt = 0;

  let lastSeekProbe = 0;

  function paintLyric(timeSec, now, dt) {
    const paused = !!(ctx.isPaused && ctx.isPaused());

    if (paused && pausedAt && !ctx.staticMode) now = pausedAt;
    const showText = ctx.getDisplay ? ctx.getDisplay().showText : true;
    stage.style.opacity = showText ? '1' : '0';
    const paint = showText;

    if (!ctx.staticMode && Math.abs(lyricTime - lastSeekProbe) > 0.3) {
      wordNodes.forEach(n => {
        n.fallDebrisFired = false; n.fallDustFired = false; n.fallDustBurst2 = false; n.fallHidden = false;
        const t = (timeSec - n.w.start) / Math.max(0.001, n.w.end - n.w.start);
        if (t >= 1) {
          n.struck = true;
          n.strikeAt = now - Math.max(0, (timeSec - n.w.start) * 1000);
        } else {
          n.struck = false; n.strikeAt = 0; n.level = 1;
        }
      });
    }
    lastSeekProbe = lyricTime;

    if (paint && currentLayout && renderedLineIndex >= 0 && ctx.lines[renderedLineIndex]) {
      const line = ctx.lines[renderedLineIndex];
      const sinceLineStart = timeSec - line.startTime;
      let desired = '';
      if (sinceLineStart >= 0 && sinceLineStart < 0.32 && !reduceMotion()) {
        const u = sinceLineStart / 0.32;
        const pulse = Math.sin(u * Math.PI);
        desired = `brightness(${(1 + pulse * 0.18).toFixed(3)})`;
      }
      if (desired !== _lastStageFilter) {
        _lastStageFilter = desired;
        stage.style.filter = desired;
      }
    }

    const coolK = S.cool;
    wordNodes.forEach(n => {
      const { w } = n;
      const cache = n._cache || (n._cache = {});
      const setStyle = (el, prop, val, key) => {
        if (!paint || cache[key] === val) return;
        cache[key] = val;
        el.style[prop] = val;
      };
      const setVar = (el, name, val, key) => {
        if (!paint || cache[key] === val) return;
        cache[key] = val;
        el.style.setProperty(name, val);
      };

      const t = (timeSec - w.start) / Math.max(0.001, w.end - w.start);
      const active = t > 0 && t < 1;
      const passed = t >= 1;
      const fresh = t > 0 && (t < 1 || timeSec - w.start < LATE_STRIKE);

      if (fresh && !n.struck && !paused) {
        n.struck = true; n.strikeAt = now;
        const sens = clamp(S.rhythm, 0, 1);
        const t3 = 78 - sens * 16, t2 = 42 - sens * 8;
        const wt = w.weight || 0;
        if (w.isFirst || (wt >= t3 + 10)) n.level = 3;
        else if (w.strong || wt >= t2 || w.isLast || fracRand(w.start * 1000, 7) > 0.92 - sens * 0.25) n.level = 2;
        else n.level = 1;
        emitSparks(n, now);
        const punch = n.level === 3 ? 1 : n.level === 2 ? 0.65 : 0.35;
        n.strain.v += punch * 2.2;
        n.lift.v += punch * 5.0;

        if (w.isFirst && !S.firstToss && !reduceMotion()) {
          n.strain.x = n.scale * ACTIVE_SCALE * 0.86;
          n.strain.v = 13;
        }
      }
      if (!active && t <= 0) n.struck = false;

      const sinceStart = timeSec - w.start;

      const noToss = w.isFirst && !S.firstToss;
      const tossWeight = w.isFirst || w.strong ? 1.2 : w.isLast ? 1.05 : 1.0;
      let tossY = 0;
      if (!noToss) {
        if (sinceStart >= -T_RISE && sinceStart < 0) {
          const u = (sinceStart + T_RISE) / T_RISE;
          const ease = 1 - Math.pow(1 - u, 3);
          tossY = TOSS_DOWN * tossWeight * (1 - ease);
        } else if (sinceStart >= 0) {
          const v0 = TOSS_V0 * tossWeight;
          const tEnd = 2 * v0 / TOSS_G;
          if (sinceStart <= tEnd) {
            const y = -v0 * sinceStart + 0.5 * TOSS_G * sinceStart * sinceStart;
            if (y < 0) tossY = y;
          }
        }
      }
      n.tossY = tossY;

      const baseScale = n.scale;

      const inRise = sinceStart >= -T_RISE && sinceStart < 0;
      const targetScale = (active || inRise) ? baseScale * ACTIVE_SCALE : passed ? baseScale : 0.5;
      if (inRise && !n.riseSeeded) {
        n.strain.x = baseScale * ACTIVE_SCALE;
        n.strain.v = 0;
        n.riseSeeded = true;
      } else if (!inRise) {
        n.riseSeeded = false;
      }
      stepSpring(n.strain, targetScale, dt);
      stepSpring(n.lift, active ? -2 : 0, dt);
      const liftScale = Math.max(0.5, n.strain.x);
      if (paint) {
        n.holder.style.transform = `translate3d(${w.x}px,${(w.y + n.lift.x + (n.tossY || 0)).toFixed(2)}px,0) scale(${liftScale.toFixed(4)}) rotate(${w.rotate}deg)`;
      }

      const since = n.strikeAt ? now - n.strikeAt : -1e9;
      const faceRise = n.level === 1 ? 0.09 : n.level === 2 ? 0.16 : 0.26;
      const faceAge = since / 1000;
      const life = 2.0 / coolK;
      let specPos = 0, specBright = 1, specContrast = 1;
      if (since >= 0 && since < 260) {
        const su = since / 260;
        specPos = lerp(-140, 140, su);
        const pulse = Math.pow(1 - su, 2);
        specBright = 1 + pulse * (n.level === 3 ? 0.85 : n.level === 2 ? 0.55 : 0.3);
        specContrast = 1 + pulse * 0.35;
      }
      const sinceEnd = timeSec * 1000 - w.end * 1000;
      const rustU = passed && n.strikeAt ? clamp((sinceEnd - RUST_HOLD * 1000) / (RUST_FALL * 1000), 0, 1) : 0;

      const faceForged = faceAge < 0 ? 0.55 : 0.55 + clamp(faceAge / faceRise, 0, 1) * 0.45;
      const face = faceForged - rustU * RUST_FACE_DARKEN;
      const rustBurned = faceAge < 0 ? 0.95 : 0.95 * (1 - clamp(faceAge / faceRise, 0, 1));
      const rustOpacity = Math.max(rustBurned, rustU * RUST_MAX);
      let edge = 0, heat = 0, glow = 0, ghost1 = 0, ghost2 = 0;
      let edgeColor = '#4A1F12';
      let heatColor = palette.hot;
      if (faceAge >= 0) {
        const coolU = clamp(faceAge / life, 0, 1);
        edge = coolU > 0.17 ? clamp((coolU - 0.17) * 0.5, 0, 0.28) : 0;
        edge = Math.max(edge, rustU * 0.5);
        let idx = coolU * 6;
        if (n.level === 1 || S.reduce) idx = Math.max(3, idx);
        heatColor = lut[clamp(Math.floor(idx / 6 * 255), 0, 255)];
        heat = Math.pow(1 - coolU, 1.35) * (n.level === 1 ? 0.34 : n.level === 3 ? 0.92 : 0.72) * S.peak;
        glow = heat * S.glow;
        if (since >= 0 && since < 90) {
          const f = 1 - since / 90;

          const core = since < 45 ? Math.pow(1 - since / 45, 1.4) : 0;
          const boost = (n.level === 1 ? 0.6 : 1) * (0.7 + f * 0.9);
          heat *= boost; glow *= boost;
          if (!S.reduce && n.level > 1) {
            const flashIdx = since < 45 ? 0 : clamp((since - 45) / 45 * 4.8, 0, 4.8);
            heatColor = lut[clamp(Math.floor(flashIdx / 6 * 255), 0, 255)];
            if (core > 0) heatColor = palette.peak;
            glow *= (1.15 + f * 0.65 + core * 0.8) * S.peak;
            edgeColor = palette.red;
            edge = Math.max(edge, f * 0.6 + core * 0.25);
          }
        }
        const gh = Math.pow(1 - clamp(since / 56, 0, 1), 2);
        ghost1 = n.level >= 2 ? gh * 0.55 : 0;
        ghost2 = n.level === 3 ? gh * 0.42 : 0;
        const smear = gh * (n.level === 3 ? 5 : 3);
        if (paint) {
          n.ghost.style.transform = `translate3d(${(-2 - smear).toFixed(2)}px,${(1 + smear * 0.4).toFixed(2)}px,0)`;
          n.ghost2.style.transform = `translate3d(${(2 + smear).toFixed(2)}px,${(-1 - smear * 0.4).toFixed(2)}px,0)`;
        }
        if (rustU > 0) {
          heatColor = lut[clamp(Math.floor((4.2 + rustU * 1.6) / 6 * 255), 0, 255)];
          heat = Math.max(heat * (1 - rustU), rustU * 0.20 * S.peak);
          glow = glow * (1 - rustU);
          ghost1 = 0; ghost2 = 0;
        }
      } else if (faceAge > -0.15) {
        const p = clamp(-faceAge / 0.15, 0, 1);
        heatColor = lut[clamp(Math.floor((3 + p * 3) / 6 * 255), 0, 255)];
        heat = p * 0.22; glow = heat * 0.5;
      }

      const shakeMag = Math.abs(shakeSpring.x) + Math.abs(shakeSpring.y);
      let highlightOffset = 0;
      if (shakeMag > 1.5) {
        const phase = (w.start * 113) % 200 - 100;
        highlightOffset = shakeSpring.x * 0.5 + phase * Math.min(1, shakeMag / 15);
      }

      setVar(n.holder, '--heatColor', heatColor, 'hc');
      setStyle(n.face, 'opacity', face.toFixed(3), 'fo');
      if (rustU > 0) { specPos = 0; specBright = 1; specContrast = 1; }
      const bgPos = `0 0, 0 0, ${(specPos + highlightOffset).toFixed(1)}px 0, 0 0`;
      const filterVal = `drop-shadow(0 1px 0 rgba(0,0,0,.85)) brightness(${specBright.toFixed(3)}) contrast(${specContrast.toFixed(3)})`;
      setStyle(n.face, 'backgroundPosition', bgPos, 'bg');
      setStyle(n.face, 'filter', filterVal, 'ft');
      setStyle(n.rust, 'opacity', rustOpacity.toFixed(3), 'ro');
      setStyle(n.edge, 'opacity', edge.toFixed(3), 'eo');
      setStyle(n.edge, 'color', edgeColor, 'ec');
      setStyle(n.ghost, 'opacity', ghost1.toFixed(3), 'g1');
      setStyle(n.ghost2, 'opacity', ghost2.toFixed(3), 'g2');
      setStyle(n.heat, 'color', heatColor, 'hec');
      setStyle(n.heat, 'opacity', clamp(heat, 0, 1).toFixed(3), 'heo');
      setStyle(n.glow, 'opacity', clamp(glow, 0, 1).toFixed(3), 'go');

      if (passed && n.strikeAt && !ctx.staticMode) applyWordFall(n, sinceEnd, now, paint);
    });
  }

  function updateVignette() {
    if (surfaceInfo().transparent) {
      vignette.style.background = 'none';
      vignette.style.transform = 'none';
      return;
    }
    const v = S.vig;
    vignette.style.background = `radial-gradient(ellipse ${85 - v * 25}% ${65 - v * 18}% at 50% 46%, transparent ${55 + v * 10}%, rgba(8,7,6,${(0.35 + v * 0.5).toFixed(2)}) 100%)`;
    vignette.style.transform = `scale(${1 + v * 0.012})`;
  }
  updateVignette();

  const readT = () => {
    const pick = (src) => {
      if (!src || typeof src.get !== 'function') return null;
      const v = src.get();
      return (typeof v === 'number' && isFinite(v)) ? v : null;
    };
    const a = pick(ctx.lyricTime);
    return a != null ? a : pick(ctx.currentTime);
  };
  lyricTime = readT() ?? 0;

  const onTimeTick = (t) => {
    if (disposed) return;
    if (typeof t === 'number' && isFinite(t)) lyricTime = t;
    if (ctx.staticMode) return;
    if (ctx.isPaused && ctx.isPaused()) return;
    const idx = resolveLineIndex();
    if (idx !== pendingLineIndex) requestLineSwitch(idx);
  };

  const subscribeTime = () => {
    const bind = (src) => {
      if (!src || typeof src.on !== 'function') return null;
      try {
        const off = src.on('change', () => onTimeTick(readT()));
        return typeof off === 'function' ? off : () => {};
      } catch (e) { return null; }
    };
    if (typeof ctx.onLyricTime === 'function') {
      const off = ctx.onLyricTime(onTimeTick);
      return typeof off === 'function' ? off : () => {};
    }
    return bind(ctx.lyricTime) || bind(ctx.currentTime) || (() => {});
  };
  const offTime = subscribeTime();

  const repaintStatic = () => {
    clearDecay();
    readSettings();
    themeForFont = ctx.getTheme ? ctx.getTheme() : {};
    fontStack = hostFontStack(themeForFont);
    fontWeight = hostFontWeight(themeForFont, 700);
    stage.style.fontFamily = fontStack;
    _lastStageFilter = ''; stage.style.filter = '';
    updateVignette();
    layoutCache.clear();
    renderedLineIndex = -2; buildCurrent(false);
    const now = performance.now();
    syncLateLine(pausedAt || now);
    paintLyric(lyricTime, now, 0.016);
    staticPainted = -999;
  };
  const onChangeFn = () => {
    if (disposed) return;
    const idx = resolveLineIndex();
    if (idx !== pendingLineIndex) requestLineSwitch(idx);
    else if (!finishing) repaintStatic();
  };
  const offChange = ctx.onChange ? ctx.onChange(onChangeFn)
    : (ctx.subscribe ? ctx.subscribe(onChangeFn) : () => {});

  const offResize = ctx.onResize ? ctx.onResize(() => { if (!disposed) resize(false); }) : () => {};

  function paintStaticFrame(now) {
    staticPainted = ctx.staticLineIndex;
    renderedLineIndex = -2;
    buildCurrent(false);
    const li = ctx.staticLineIndex;
    const t = (li != null && li >= 0 && ctx.lines[li]) ? ctx.lines[li].startTime + 0.3 : 0;
    wordNodes.forEach(n => {
      n.struck = true;
      n.strikeAt = now - 150;
      n.level = n.w.isFirst ? 3 : 2;
    });
    paintLyric(t, now, 0.016);
  }

  const frameFn = () => {
    if (disposed) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;

    if (ctx.staticMode) {
      if (staticPainted !== ctx.staticLineIndex) paintStaticFrame(now);
      return;
    }

    if (ctx.isPaused && ctx.isPaused()) {
      if (!lastPaused) {
        lastPaused = true; pausedAt = now;

        shakeSpring.x = shakeSpring.y = shakeSpring.vx = shakeSpring.vy = 0;
        stage.style.transform = 'translate3d(0,0,0)';
      }
      return;
    }
    if (lastPaused) {
      const pauseDur = now - pausedAt;
      if (pauseDur > 0) {
        for (const sh of shocks) sh.at += pauseDur;
        if (groundShockAt) groundShockAt += pauseDur;

        if (finishing) {
          finishStart += pauseDur;

          if (switchHardAt) switchHardAt += pauseDur;
        }
      }
    }
    lastPaused = false; pausedAt = 0;

    const tv = readT();
    if (tv != null) lyricTime = tv;
    const idx = resolveLineIndex();
    if (idx !== pendingLineIndex) requestLineSwitch(idx);
    tryLineSwitch(now);
    if (!ctx.staticMode && currentLayout && idx >= 0) {
      const end = ctx.lines[idx] ? ctx.lines[idx].endTime : Infinity;
      if (end - lyricTime < 1.2 && end - lyricTime > 0.18) getLayout(ctx.lines[idx + 1] || ctx.lines[idx], idx + 1);
    }
    stepRowEntries(dt);
    paintLyric(ctx.staticMode
      ? (ctx.staticLineIndex != null ? ctx.lines[ctx.staticLineIndex] ? ctx.lines[ctx.staticLineIndex].startTime + 0.2 : 0 : lyricTime)
      : paintTimeFor(now), now, dt);
    drawFx(now, dt);
  };

  let rafId = 0, frameAlive = true, offFrame;
  if (typeof ctx.onFrame === 'function') {
    offFrame = ctx.onFrame(frameFn) || (() => {});
  } else {
    const rafLoop = () => { if (!frameAlive) return; frameFn(); rafId = requestAnimationFrame(rafLoop); };
    rafId = requestAnimationFrame(rafLoop);
    offFrame = () => { frameAlive = false; if (rafId) cancelAnimationFrame(rafId); };
  }

  resize(true);
  lastIndexSeen = resolveLineIndex();
  pendingLineIndex = lastIndexSeen;
  finishing = false;
  buildCurrent();
  paintLyric(lyricTime, performance.now(), 0.016);

  if (ctx.staticMode) paintStaticFrame(performance.now());

  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (disposed) return;
      for (const layout of layoutCache.values()) layout._overlapFit = null;
      renderedLineIndex = -2;
      const now = performance.now();
      buildCurrent(false);

      syncLateLine(pausedAt || now);
      paintLyric(paintTimeFor(now), now, 0.016);
      staticPainted = -999;
    }).catch(() => {});
  }

  return () => {
    disposed = true;
    clearDecay();
    offTime && offTime(); offChange && offChange(); offResize && offResize(); offFrame && offFrame();
    if (bloomCanvas) { bloomCanvas.width = 0; bloomCanvas.height = 0; bloomCtx = null; }
    container.replaceChildren();

    container.style.position = '';
    container.style.inset = '';
    container.style.overflow = '';
  };
}

export default function activate(folium) {
  folium.registries.visualizers.register({
    id: 'iron-time',
    label: { 'zh-CN': 'IronTime', en: 'IronTime' },
    order: 430,
    settings: SETTINGS,
    hostLayers: { subtitles: false },
    mount: (container, ctx) => mountForge(folium, container, ctx),
  });
}
