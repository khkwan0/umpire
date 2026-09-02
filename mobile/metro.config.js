const path = require('node:path')
const {getDefaultConfig} = require('expo/metro-config')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
config.resolver.extraNodeModules = {
  '@umpire/mobile-api': path.resolve(projectRoot, 'src/lib/api.ts'),
  '@umpire/mobile-auth': path.resolve(
    projectRoot,
    'src/providers/AuthProvider.tsx',
  ),
  '@umpire/mobile-ui': path.resolve(
    projectRoot,
    'src/components/umpire-ui.tsx',
  ),
  '@umpire/mobile-form': path.resolve(projectRoot, 'src/components/form.tsx'),
  '@umpire/mobile-theme': path.resolve(
    projectRoot,
    'src/hooks/use-umpire-theme.ts',
  ),
  '@umpire/mobile-spacing': path.resolve(
    projectRoot,
    'src/constants/umpire-theme.ts',
  ),
  '@umpire/plugin-ui': path.resolve(projectRoot, 'src/plugin-ui.ts'),
}

module.exports = config
