const {AndroidConfig, withAndroidManifest} = require('expo/config-plugins')

const FCM_CHANNEL_ID =
  'com.google.firebase.messaging.default_notification_channel_id'
const FCM_COLOR = 'com.google.firebase.messaging.default_notification_color'

/**
 * expo-notifications and @react-native-firebase/messaging both declare FCM
 * default notification meta-data. tools:replace lets our app manifest win.
 */
module.exports = function withAndroidFirebaseNotificationManifest(config) {
  return withAndroidManifest(config, config => {
    const manifest = config.modResults.manifest ?? config.modResults
    if (manifest?.$) {
      manifest.$['xmlns:tools'] =
        manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools'
    }

    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(
      config.modResults,
    )

    for (const metaData of mainApplication['meta-data'] ?? []) {
      const name = metaData.$?.['android:name']
      if (name === FCM_CHANNEL_ID) {
        metaData.$['tools:replace'] = 'android:value'
      }
      if (name === FCM_COLOR) {
        metaData.$['tools:replace'] = 'android:resource'
      }
    }

    return config
  })
}
