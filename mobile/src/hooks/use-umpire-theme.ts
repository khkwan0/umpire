import {useColorScheme} from 'react-native'
import {UmpireColors} from '@/constants/umpire-theme'

export function useUmpireTheme() {
  const scheme = useColorScheme()
  const isDark = scheme === 'dark'
  const colors = isDark ? UmpireColors.dark : UmpireColors.light
  return {colors, isDark}
}
