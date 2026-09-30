// Design tokens for the whole app. Screens compose these instead of repeating
// raw hex values, so brand, spacing, and type stay consistent everywhere.

export const COLORS = {
  // Brand
  brand: '#095C37',
  brandDark: '#06331F',
  brandTint: '#E4F1EA',
  accent: '#FFD700',
  accentDark: '#8A6D00',
  accentTint: '#FFF6CC',
  route: '#2563EB',
  routeTint: '#E5EDFD',

  // Neutrals
  ink: '#0E1512',
  inkSecondary: '#5A6661',
  inkMuted: '#8B9490',
  line: '#E5E9E7',
  lineStrong: '#D3D9D6',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F6F5',
  canvas: '#F7F9F8',
  overlay: 'rgba(14, 21, 18, 0.55)',
  onBrand: '#FFFFFF',
  onAccent: '#1A1A1A',

  // Status
  danger: '#D92D20',
  dangerTint: '#FDECEA',
  success: '#12805C',
  successTint: '#E4F1EA',
  warning: '#B54708',
  warningTint: '#FEF0C7',
};

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, pill: 999 };

// One type scale, used through the `TYPE` styles below.
export const TYPE = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.6, color: COLORS.ink },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.4, color: COLORS.ink },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: '700', letterSpacing: -0.2, color: COLORS.ink },
  subheading: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: COLORS.ink },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '500', color: COLORS.ink },
  bodyMuted: { fontSize: 15, lineHeight: 21, fontWeight: '500', color: COLORS.inkSecondary },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: COLORS.inkSecondary },
  captionStrong: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: COLORS.ink },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.8, color: COLORS.inkMuted },
  metric: { fontSize: 28, lineHeight: 32, fontWeight: '800', letterSpacing: -0.6, color: COLORS.ink },
};

// Shadows are subtle by default: depth comes from hierarchy, not haze.
export const ELEVATION = {
  card: {
    shadowColor: '#0E1512', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  floating: {
    shadowColor: '#0E1512', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.16, shadowRadius: 10, elevation: 6,
  },
  sheet: {
    shadowColor: '#0E1512', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.1, shadowRadius: 18, elevation: 16,
  },
};

export const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
