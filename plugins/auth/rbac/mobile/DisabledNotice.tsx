import {Panel, MutedText, SectionTitle} from '@umpire/mobile-ui'

export default function DisabledNotice() {
  return (
    <Panel>
      <SectionTitle>Authentication</SectionTitle>
      <MutedText>
        The auth plugin is disabled — the API runs in open mode with no
        sign-in. Users, roles, and API tokens are hidden until you re-enable
        auth under Plugin manager below.
      </MutedText>
    </Panel>
  )
}
