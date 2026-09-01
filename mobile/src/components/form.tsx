import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import {useUmpireTheme} from '@/hooks/use-umpire-theme'
import {Spacing} from '@/constants/umpire-theme'

export function PrimaryButton({
  title,
  onPress,
  disabled,
  loading,
  style,
}: {
  title: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  style?: ViewStyle
}) {
  const {colors} = useUmpireTheme()
  return (
    <Pressable
      style={[
        styles.button,
        {backgroundColor: colors.buttonBg, opacity: disabled ? 0.5 : 1},
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}>
      {loading ? (
        <ActivityIndicator color={colors.buttonFg} />
      ) : (
        <Text style={[styles.buttonText, {color: colors.buttonFg}]}>{title}</Text>
      )}
    </Pressable>
  )
}

export function SecondaryButton({
  title,
  onPress,
  danger,
  disabled,
}: {
  title: string
  onPress: () => void
  danger?: boolean
  disabled?: boolean
}) {
  const {colors} = useUmpireTheme()
  return (
    <Pressable
      style={[
        styles.secondary,
        {
          borderColor: danger ? colors.danger : colors.line,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}>
      <Text style={{color: danger ? colors.danger : colors.accent, fontWeight: '600'}}>
        {title}
      </Text>
    </Pressable>
  )
}

export function Field({
  label,
  ...props
}: TextInputProps & {label: string}) {
  const {colors} = useUmpireTheme()
  return (
    <>
      <Text style={[styles.label, {color: colors.text}]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.panel,
            borderColor: colors.line,
          },
        ]}
        {...props}
      />
    </>
  )
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  secondary: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
})
