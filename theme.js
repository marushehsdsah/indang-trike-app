// Design tokens for the whole app. Screens compose these instead of repeating
// raw values, so brand, spacing, and type stay consistent everywhere.

export const COLORS = {
  // Brand: IndangGO green carries live states and the app's shell; the
  // for-hire plate yellow marks the one action that books or accepts a trip.
  brand: '#095C37',
  brandDark: '#06331F',
  brandTint: '#D9EFE2',
  accent: '#FFD700',
  accentDark: '#7A6000',
  accentTint: '#FFF4C2',
  route: '#2563EB',
  routeTint: '#E3ECFD',

  // Neutrals, tinted slightly toward the brand green.
  ink: '#101814',
  inkSecondary: '#4E5B55',
  inkMuted: '#69736F',
  line: '#DDE3DF',
  lineStrong: '#C9D1CC',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F3F1',
  canvas: '#EEF2EF',
  overlay: 'rgba(16, 24, 20, 0.55)',
  onBrand: '#FFFFFF',
  onAccent: '#101814',

  // Status
  danger: '#C62828',
  dangerTint: '#FDE7E7',
  success: '#0B7A4B',
  successTint: '#D9EFE2',
  warning: '#8A5300',
  warningTint: '#FFF1C2',
};

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 20, card: 24, pill: 999 };

// Fredoka, a rounded face, sets headings, buttons and the numbers people read
// at a glance (minutes, fares, countdowns); Roboto, the system face, sets
// everything else. Fredoka has no peso sign, so Money draws it in Roboto.
export const FONTS = { semibold: 'Fredoka_600SemiBold', bold: 'Fredoka_700Bold' };

// One type scale, used through these styles. Custom faces carry their weight
// in the font file, so their styles set no fontWeight.
export const TYPE = {
  display: { fontFamily: FONTS.bold, fontSize: 36, lineHeight: 42, color: COLORS.ink },
  title: { fontFamily: FONTS.semibold, fontSize: 26, lineHeight: 32, color: COLORS.ink },
  heading: { fontFamily: FONTS.semibold, fontSize: 21, lineHeight: 27, color: COLORS.ink },
  metric: { fontFamily: FONTS.bold, fontSize: 30, lineHeight: 34, color: COLORS.ink },
  button: { fontFamily: FONTS.semibold, fontSize: 17, lineHeight: 22 },
  subheading: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: COLORS.ink },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400', color: COLORS.ink },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '500', color: COLORS.ink },
  bodyMuted: { fontSize: 16, lineHeight: 22, fontWeight: '400', color: COLORS.inkSecondary },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: COLORS.ink },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400', color: COLORS.inkSecondary },
  captionStrong: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: COLORS.ink },
};

// Depth is a soft offset shadow, never a halo: cards sit on the canvas, floating
// cards and map buttons sit above the map.
export const ELEVATION = {
  card: {
    shadowColor: '#101814', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 1,
  },
  floating: {
    shadowColor: '#101814', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
  },
};

export const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
