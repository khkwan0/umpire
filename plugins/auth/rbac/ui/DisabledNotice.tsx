export default function DisabledNotice() {
  return (
    <section className="panel">
      <h2>Authentication</h2>
      <p className="muted small">
        The auth plugin is disabled — the API runs in open mode with no sign-in.
        Users, roles, and API tokens are hidden until you re-enable auth under
        Plugin manager below.
      </p>
    </section>
  )
}
