# shellcheck shell=bash
# Sourced by archive_android.sh / deploy_android.sh after `expo prebuild`.
#
# Env overrides:
#   MAX_CPUS          default 4
#   MAX_HEAP_MB       Gradle daemon heap (default 1536)
#   MAX_METASPACE_MB  Gradle MaxMetaspaceSize (default 768)
#   KOTLIN_HEAP_MB    Kotlin daemon heap (default 1024)
#   NODE_HEAP_MB      Metro/React Native bundler heap (default 1536)

apply_android_gradle_limits() {
  MAX_CPUS="${MAX_CPUS:-4}"
  MAX_HEAP_MB="${MAX_HEAP_MB:-1536}"
  MAX_METASPACE_MB="${MAX_METASPACE_MB:-768}"
  KOTLIN_HEAP_MB="${KOTLIN_HEAP_MB:-1024}"
  NODE_HEAP_MB="${NODE_HEAP_MB:-1536}"

  local props="android/gradle.properties"
  if [ ! -f "$props" ]; then
    echo "error: missing ${props} (run prebuild first)" >&2
    return 1
  fi

  # Rewrite limits idempotently. Also repairs older runs that appended without a
  # leading newline and glued "# UMPIRE_GRADLE_LIMITS" onto the previous property.
  MAX_CPUS="$MAX_CPUS" MAX_HEAP_MB="$MAX_HEAP_MB" MAX_METASPACE_MB="$MAX_METASPACE_MB" \
  KOTLIN_HEAP_MB="$KOTLIN_HEAP_MB" PROPS_PATH="$props" node <<'EOF'
const fs = require('fs')
const path = process.env.PROPS_PATH
let text = fs.readFileSync(path, 'utf8')

// Drop previous limits blocks while markers are still intact
text = text.replace(
  /\n?# UMPIRE_GRADLE_LIMITS\n[\s\S]*?# UMPIRE_GRADLE_LIMITS_END\n?/g,
  '\n',
)
text = text.replace(/\n?# UMPIRE_GRADLE_LIMITS_END\n?/g, '\n')

// Unglue marker stuck on previous line (corrupts Expo's last property)
text = text.replace(/# UMPIRE_GRADLE_LIMITS\b/g, '')

// Expo's last generated property — discard anything after it (orphan keys from
// older broken appends), then write a clean limits block.
const marker = 'expo.inlineModules.watchedDirectories=[]'
const idx = text.lastIndexOf(marker)
if (idx !== -1) {
  text = text.slice(0, idx + marker.length)
}

text = text.replace(/\s+$/g, '\n')

const block = `
# UMPIRE_GRADLE_LIMITS
org.gradle.jvmargs=-Xmx${process.env.MAX_HEAP_MB}m -XX:MaxMetaspaceSize=${process.env.MAX_METASPACE_MB}m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8
org.gradle.workers.max=${process.env.MAX_CPUS}
kotlin.daemon.jvmargs=-Xmx${process.env.KOTLIN_HEAP_MB}m -XX:MaxMetaspaceSize=384m
# UMPIRE_GRADLE_LIMITS_END
`
fs.writeFileSync(path, text + '\n' + block)
EOF

  # Last org.gradle.jvmargs / workers.max in the file wins over Expo defaults.
  export NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS} }--max-old-space-size=${NODE_HEAP_MB}"

  # Drop any existing high-memory daemons so the new jvmargs take effect.
  if [ -x android/gradlew ]; then
    (cd android && ./gradlew --stop >/dev/null 2>&1) || true
  fi

  echo "Gradle limits: workers=${MAX_CPUS}, heap=${MAX_HEAP_MB}m, metaspace=${MAX_METASPACE_MB}m, kotlin=${KOTLIN_HEAP_MB}m, node=${NODE_HEAP_MB}m"
}
