/**
 * UMPIRE brand colors aligned with the web UI.
 */
import {Platform} from 'react-native'

export const UmpireColors = {
  light: {
    text: '#1b365d',
    textSecondary: '#5a6b7d',
    background: '#f0f2f5',
    pageTop: '#f7f9fc',
    panel: '#ffffff',
    line: '#d0d7e0',
    accent: '#1b365d',
    buttonBg: '#1b365d',
    buttonFg: '#f7f2e8',
    danger: '#9b2c2c',
    warn: '#9a6700',
    up: '#0f6e56',
    down: '#9b2c2c',
    partial: '#9a6700',
    paused: '#5a6b7d',
    pending: '#9a6700',
    pill: '#ece7dc',
    pillUp: '#d8f3e7',
    pillDown: '#f8d7d7',
    pillWarn: '#f7e7c4',
  },
  dark: {
    text: '#e8eef6',
    textSecondary: '#9aa8b8',
    background: '#10151c',
    pageTop: '#0c1016',
    panel: '#1a2330',
    line: '#314056',
    accent: '#8eb4e8',
    buttonBg: '#8eb4e8',
    buttonFg: '#10151c',
    danger: '#e07070',
    warn: '#d4a017',
    up: '#4cbe9a',
    down: '#e07070',
    partial: '#d4a017',
    paused: '#9aa8b8',
    pending: '#d4a017',
    pill: '#2a3340',
    pillUp: '#1a3d32',
    pillDown: '#4a2424',
    pillWarn: '#3d3318',
  },
} as const

export type UmpireTheme = keyof typeof UmpireColors.light & keyof typeof UmpireColors.dark

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
} as const

export const Fonts = Platform.select({
  ios: {sans: 'system-ui', mono: 'ui-monospace'},
  default: {sans: 'normal', mono: 'monospace'},
  web: {sans: 'var(--font-display)', mono: 'var(--font-mono)'},
})

export const BottomTabInset = Platform.select({ios: 50, android: 80}) ?? 0
