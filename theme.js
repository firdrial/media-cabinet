/* ============================================================
 * theme.js
 *
 * Single source of truth for app-wide color themes.
 *
 * BASE = the app's current colors (scraped from HomeScreen.js
 * styles), exported as the "classic" theme and used as the
 * fallback/default on first launch.
 *
 * Adding a new theme = one makeTheme() call with ONLY the
 * tokens that differ. Everything else inherits from BASE.
 *
 * Token map (every token corresponds 1:1 to a hardcoded hex
 * that currently lives in a screen's StyleSheet):
 *
 *   background                     container bg            (#121212)
 *   headerBackground/headerBorder  header bg / bottom line (#1a1a1a / #333333)
 *   headerTitle / headerSub        title / count text      (#ffffff / #888888)
 *   cardBackground / cardBorder    collection card         (#1e1e1e / #333333)
 *   titleText / typeText           card title / format     (#ffffff / #e50914)
 *   detailsText                    card details line       (#aaaaaa)
 *   iconColor / chevron            card icon / chevron     (#e50914 / #666666)
 *   chipBackground/Border/Text     tag chips               (#2a2a2a / #2a2a2a / #888888)
 *   inputBackground/Border/Text    search + form inputs    (#2a2a2a / #333333 / #ffffff)
 *   placeholderText                input placeholders      (#666666)
 *   accent / onAccent / accentSoft primary red, text on it,
 *                                  translucent red tint      (#e50914 / #ffffff / rgba(229,9,20,0.15))
 *   fabBackground / fabIcon        floating + button       (#e50914 / #ffffff)
 *   sheetBackground/Border/Handle  bottom sheets           (#1e1e1e / #333333 / #444444)
 *   backdrop                       modal scrim             (rgba(0,0,0,0.6))
 *   textPrimary / textSecondary    sheet titles / labels   (#ffffff / #aaaaaa)
 *   textMuted / textFaint          #888888 / #666666
 *   emptyIcon                      empty-state icon        (#333333)
 * ============================================================ */

export const DEFAULT_THEME_ID = 'classic';

/* The app's exact current look. */
const BASE = {
  background: '#121212',
  headerBackground: '#1a1a1a',
  headerBorder: '#333333',
  headerTitle: '#ffffff',
  headerSub: '#888888',
  cardBackground: '#1e1e1e',
  cardBorder: '#333333',
  titleText: '#ffffff',
  typeText: '#e50914',
  detailsText: '#aaaaaa',
  iconColor: '#e50914',
  chevron: '#666666',
  chipBackground: '#2a2a2a',
  chipBorder: '#2a2a2a',
  chipText: '#888888',
  inputBackground: '#2a2a2a',
  inputBorder: '#333333',
  inputText: '#ffffff',
  placeholderText: '#666666',
  accent: '#e50914',
  onAccent: '#ffffff',
  accentSoft: 'rgba(229, 9, 20, 0.15)',
  fabBackground: '#e50914',
  fabIcon: '#ffffff',
  sheetBackground: '#1e1e1e',
  sheetBorder: '#333333',
  sheetHandle: '#444444',
  backdrop: 'rgba(0, 0, 0, 0.6)',
  textPrimary: '#ffffff',
  textSecondary: '#aaaaaa',
  textMuted: '#888888',
  textFaint: '#666666',
  emptyIcon: '#333333',
};

const makeTheme = (id, label, overrides = {}) => ({
  id,
  label,
  ...BASE,
  ...overrides,
});

export const THEMES = {
  /* Current look, unchanged. Default on first launch. */
  classic: makeTheme('classic', 'Classic'),

  blockbuster: makeTheme('blockbuster', 'Blockbuster', {
    background: '#0B3FA0',
    headerBackground: '#0B3FA0',
    headerBorder: '#0B3FA0',
    headerTitle: '#FFC72C',
    headerSub: '#ffffff',
    cardBackground: '#F5F5F5',
    cardBorder: '#F5F5F5',
    titleText: '#0B2E66',
    typeText: '#0B3FA0',
    detailsText: '#44557A',
    iconColor: '#0B3FA0',
    chevron: '#0B2E66',
    chipBackground: '#2F62B8',
    chipBorder: '#2F62B8',
    chipText: '#ffffff',
    inputBackground: '#F5F5F5',
    inputBorder: '#F5F5F5',
    inputText: '#0B2E66',
    placeholderText: '#5A6B8C',
    accent: '#FFC72C',
    onAccent: '#0B2E66',
    accentSoft: 'rgba(255, 199, 44, 0.18)',
    fabBackground: '#FFC72C',
    fabIcon: '#0B2E66',
    sheetBackground: '#ffffff',
    sheetBorder: '#0B3FA0',
    sheetHandle: '#C4CDE0',
    textPrimary: '#0B2E66',
    textSecondary: '#44557A',
    textMuted: '#5A6B8C',
    textFaint: '#7A89A8',
    emptyIcon: '#C4CDE0',
  }),

  familyVideo: makeTheme('familyVideo', 'Family Video', {
    background: '#0E4429',
    headerBackground: '#0E4429',
    headerBorder: '#0E4429',
    headerTitle: '#F2620F',
    headerSub: '#ffffff',
    cardBackground: '#14532D',
    cardBorder: '#F2620F',
    typeText: '#F2620F',
    detailsText: '#BFD8C9',
    iconColor: '#F2620F',
    chevron: '#F2620F',
    chipBackground: '#1E5E38',
    chipBorder: '#1E5E38',
    chipText: '#F5A45C',
    inputBackground: '#14532D',
    inputBorder: '#F2620F',
    placeholderText: '#9DBFA9',
    accent: '#F2620F',
    onAccent: '#0E4429',
    accentSoft: 'rgba(242, 98, 15, 0.15)',
    fabBackground: '#F2620F',
    fabIcon: '#0E4429',
    sheetBackground: '#14532D',
    sheetBorder: '#F2620F',
    sheetHandle: '#3E7A55',
    textSecondary: '#BFD8C9',
    textMuted: '#9DBFA9',
    textFaint: '#7FA98D',
    emptyIcon: '#1E5E38',
  }),

  hollywoodVideo: makeTheme('hollywoodVideo', 'Hollywood Video', {
    background: '#2E3178',
    headerBackground: '#0B0B0F',
    headerBorder: '#0B0B0F',
    headerSub: '#FF5A4E',
    cardBackground: '#1E2352',
    cardBorder: '#FF5A4E',
    typeText: '#FF5A4E',
    detailsText: '#B9BDE0',
    iconColor: '#D9A441',
    chevron: '#D9A441',
    chipBackground: '#10132B',
    chipBorder: '#10132B',
    chipText: '#D9A441',
    inputBackground: '#1E2352',
    inputBorder: '#FF5A4E',
    placeholderText: '#9AA0C0',
    accent: '#FF5A4E',
    onAccent: '#0B0B0F',
    accentSoft: 'rgba(255, 90, 78, 0.15)',
    fabBackground: '#D9A441',
    fabIcon: '#10132B',
    sheetBackground: '#1E2352',
    sheetBorder: '#FF5A4E',
    sheetHandle: '#4A4E8C',
    textSecondary: '#B9BDE0',
    textMuted: '#9AA0C0',
    textFaint: '#7C81A8',
    emptyIcon: '#3A3E70',
  }),

  suncoast: makeTheme('suncoast', 'Suncoast', {
    background: '#14181C',
    headerBackground: '#14181C',
    headerBorder: '#14181C',
    headerTitle: '#FF4A3D',
    headerSub: '#FF4A3D',
    cardBackground: '#1E242A',
    cardBorder: '#FF4A3D',
    typeText: '#FF4A3D',
    detailsText: '#AAB4BC',
    iconColor: '#FF4A3D',
    chevron: '#FF4A3D',
    chipBackground: '#101418',
    chipBorder: '#101418',
    chipText: '#FF6B5E',
    inputBackground: '#1E242A',
    inputBorder: '#FF4A3D',
    placeholderText: '#8A949C',
    accent: '#FF4A3D',
    onAccent: '#14181C',
    accentSoft: 'rgba(255, 74, 61, 0.15)',
    fabBackground: '#FF4A3D',
    fabIcon: '#14181C',
    sheetBackground: '#1E242A',
    sheetBorder: '#FF4A3D',
    sheetHandle: '#3A444C',
    textSecondary: '#AAB4BC',
    textMuted: '#8A949C',
    textFaint: '#6A747C',
    emptyIcon: '#2A343C',
  }),

  majorVideo: makeTheme('majorVideo', 'Major Video', {
    background: '#F4F1E8',
    headerBackground: '#C8102E',
    headerBorder: '#C8102E',
    headerSub: '#ffffff',
    cardBackground: '#FBFAF7',
    cardBorder: '#C8102E',
    titleText: '#C8102E',
    typeText: '#C8102E',
    detailsText: '#7A6A5C',
    iconColor: '#C8102E',
    chevron: '#C8102E',
    chipBackground: '#FBFAF7',
    chipBorder: '#C8102E',
    chipText: '#C8102E',
    inputBackground: '#FBFAF7',
    inputBorder: '#C8102E',
    inputText: '#4A3A2A',
    placeholderText: '#A89888',
    accent: '#C8102E',
    onAccent: '#ffffff',
    accentSoft: 'rgba(200, 16, 46, 0.12)',
    fabBackground: '#C8102E',
    fabIcon: '#ffffff',
    sheetBackground: '#FBFAF7',
    sheetBorder: '#C8102E',
    sheetHandle: '#D8C8B8',
    textPrimary: '#4A3A2A',
    textSecondary: '#7A6A5C',
    textMuted: '#8A7A6A',
    textFaint: '#A09080',
    emptyIcon: '#D8C8B8',
  }),

  towerRecords: makeTheme('towerRecords', 'Tower Records', {
    background: '#E3D021',
    headerBackground: '#E3D021',
    headerBorder: '#E3D021',
    headerTitle: '#CE0F2D',
    headerSub: '#CE0F2D',
    cardBackground: '#FAFAF7',
    cardBorder: '#CE0F2D',
    titleText: '#CE0F2D',
    typeText: '#CE0F2D',
    detailsText: '#6B6B5C',
    iconColor: '#CE0F2D',
    chevron: '#CE0F2D',
    chipBackground: '#CE0F2D',
    chipBorder: '#CE0F2D',
    chipText: '#ffffff',
    inputBackground: '#FAFAF7',
    inputBorder: '#CE0F2D',
    inputText: '#3A3A2E',
    placeholderText: '#8A8A7A',
    accent: '#CE0F2D',
    onAccent: '#ffffff',
    accentSoft: 'rgba(206, 15, 45, 0.12)',
    fabBackground: '#CE0F2D',
    fabIcon: '#ffffff',
    sheetBackground: '#FAFAF7',
    sheetBorder: '#CE0F2D',
    sheetHandle: '#C9C9B8',
    textPrimary: '#2E2E24',
    textSecondary: '#6B6B5C',
    textMuted: '#8A8A7A',
    textFaint: '#A0A090',
    emptyIcon: '#C9C9B8',
  }),
};

/* Safe lookup — unknown/missing ids fall back to the classic look. */
export function getTheme(themeId) {
  return THEMES[themeId] || THEMES[DEFAULT_THEME_ID];
}

/* For the theme picker UI (id + display label only). */
export const THEME_OPTIONS = Object.values(THEMES).map(({ id, label }) => ({
  id,
  label,
}));