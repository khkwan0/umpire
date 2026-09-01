const { withAppBuildGradle } = require('expo/config-plugins')

const RELEASE_SIGNING_LINE =
  'signingConfig umpireKeystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug'

/**
 * Adds a release signingConfig that reads android/keystore.properties when present.
 * archive_android.sh writes that file from .env.local after prebuild.
 */
function addReleaseSigning(contents) {
  if (!contents.includes('signingConfigs {')) {
    throw new Error(
      'withAndroidReleaseSigning: signingConfigs block not found in app/build.gradle',
    )
  }

  if (!contents.includes('// UMPIRE_RELEASE_SIGNING')) {
    const propsLoader = `
    // UMPIRE_RELEASE_SIGNING
    def umpireKeystoreProperties = new Properties()
    def umpireKeystorePropertiesFile = rootProject.file('keystore.properties')
    if (umpireKeystorePropertiesFile.exists()) {
        umpireKeystoreProperties.load(new FileInputStream(umpireKeystorePropertiesFile))
    }
`
    contents = contents.replace(/android\s*\{/, `android {${propsLoader}`)
  }

  if (!contents.includes('UMPIRE_RELEASE_SIGNING_CONFIG')) {
    const releaseConfig = `
        release {
            // UMPIRE_RELEASE_SIGNING_CONFIG
            if (umpireKeystorePropertiesFile.exists()) {
                keyAlias umpireKeystoreProperties['keyAlias']
                keyPassword umpireKeystoreProperties['keyPassword']
                storeFile file(umpireKeystoreProperties['storeFile'])
                storePassword umpireKeystoreProperties['storePassword']
            }
        }`

    // Insert release config immediately before the closing brace of signingConfigs
    const marker = `            keyPassword 'android'
        }
    }
    buildTypes {`
    if (!contents.includes(marker)) {
      throw new Error(
        'withAndroidReleaseSigning: unexpected signingConfigs/debug template',
      )
    }
    contents = contents.replace(
      marker,
      `            keyPassword 'android'
        }${releaseConfig}
    }
    buildTypes {`,
    )
  }

  // Expo template has this exact comment + debug signing on release
  const releaseDebugSigning = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`

  const releaseReleaseSigning = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            ${RELEASE_SIGNING_LINE}`

  if (contents.includes(RELEASE_SIGNING_LINE)) {
    return contents
  }

  if (!contents.includes(releaseDebugSigning)) {
    throw new Error(
      'withAndroidReleaseSigning: buildTypes.release debug signing line not found',
    )
  }

  contents = contents.replace(releaseDebugSigning, releaseReleaseSigning)

  // Ensure debug build type was not altered
  if (
    !contents.includes(`        debug {
            signingConfig signingConfigs.debug
        }`)
  ) {
    throw new Error(
      'withAndroidReleaseSigning: debug buildType signingConfig was altered',
    )
  }

  return contents
}

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    config.modResults.contents = addReleaseSigning(config.modResults.contents)
    return config
  })
}

module.exports.addReleaseSigning = addReleaseSigning
