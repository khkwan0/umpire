const { withXcodeProject } = require('expo/config-plugins')

const PHASE_NAME = '[UMPIRE] Sign Embedded Frameworks'

const SIGN_FRAMEWORKS_SCRIPT = `set -e
APP_FRAMEWORKS="\${TARGET_BUILD_DIR}/\${WRAPPER_NAME}/Frameworks"
if [ ! -d "\$APP_FRAMEWORKS" ]; then
  exit 0
fi

IDENTITY="\${EXPANDED_CODE_SIGN_IDENTITY:-}"
if [ -z "\$IDENTITY" ] || [ "\$IDENTITY" = "-" ]; then
  if [ "\${CONFIGURATION:-}" = "Release" ]; then
    IDENTITY=\$(security find-identity -v -p codesigning | awk -F'"' '/Apple Distribution|iPhone Distribution/{print \$2; exit}')
  fi
  if [ -z "\$IDENTITY" ]; then
    IDENTITY=\$(security find-identity -v -p codesigning | awk -F'"' '/Apple Development|iPhone Developer/{print \$2; exit}')
  fi
fi

if [ -z "\$IDENTITY" ]; then
  echo "error: No code signing identity available to sign embedded frameworks."
  exit 1
fi

find "\$APP_FRAMEWORKS" -maxdepth 1 -name '*.framework' -type d | while read -r fw; do
  echo "Code Signing \$fw with Identity \$IDENTITY"
  /usr/bin/codesign --force --sign "\$IDENTITY" --preserve-metadata=identifier,entitlements "\$fw"
done
`

/**
 * CocoaPods embed can leave precompiled XCFrameworks unsigned (especially after a
 * failed/incremental build), which causes ApplicationVerificationFailed on device.
 * This phase re-signs Frameworks/ before Xcode signs the app bundle.
 */
module.exports = function withIosSignEmbeddedFrameworks(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults
    const existing = project.pbxItemByComment(PHASE_NAME, 'PBXShellScriptBuildPhase')
    if (!existing) {
      project.addBuildPhase([], 'PBXShellScriptBuildPhase', PHASE_NAME, null, {
        shellPath: '/bin/sh',
        shellScript: SIGN_FRAMEWORKS_SCRIPT,
      })
    }
    return config
  })
}
