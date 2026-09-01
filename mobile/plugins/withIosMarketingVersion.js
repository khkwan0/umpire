const { withXcodeProject } = require('expo/config-plugins')

function quotePbxprojString(value) {
  if (value == null || value === '') return value
  const str = String(value)
  if (/^[A-Za-z0-9_./-]+$/.test(str)) {
    return str
  }
  return `"${str.replace(/"/g, '\\"')}"`
}

/**
 * Expo writes identity fields into Info.plist, but Xcode's General tab reads
 * MARKETING_VERSION, CURRENT_PROJECT_VERSION, and INFOPLIST_KEY_* from pbxproj.
 */
module.exports = function withIosMarketingVersion(config) {
  const version = config.version ?? '1.0'
  const buildNumber = String(config.ios?.buildNumber ?? '1')
  const displayName = config.ios?.infoPlist?.CFBundleDisplayName ?? config.name
  const category = config.ios?.infoPlist?.LSApplicationCategoryType

  return withXcodeProject(config, (config) => {
    const configurations = config.modResults.pbxXCBuildConfigurationSection()

    for (const key of Object.keys(configurations)) {
      const buildSettings = configurations[key]?.buildSettings
      if (!buildSettings) continue
      if (
        buildSettings.MARKETING_VERSION == null &&
        buildSettings.CURRENT_PROJECT_VERSION == null
      ) {
        continue
      }

      buildSettings.MARKETING_VERSION = version
      buildSettings.CURRENT_PROJECT_VERSION = buildNumber

      if (displayName) {
        buildSettings.INFOPLIST_KEY_CFBundleDisplayName =
          quotePbxprojString(displayName)
      }
      if (category) {
        buildSettings.INFOPLIST_KEY_LSApplicationCategoryType =
          quotePbxprojString(category)
      }
    }

    return config
  })
}
