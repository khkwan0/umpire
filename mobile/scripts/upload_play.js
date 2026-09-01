#!/usr/bin/env node
/**
 * Upload an Android App Bundle to Google Play.
 *
 * Env:
 *   PLAY_SERVICE_ACCOUNT_JSON  path to service account JSON
 *   PLAY_PACKAGE_NAME          default com.umpire
 *   PLAY_TRACK                 default internal (internal|alpha|beta|production)
 *   PLAY_RELEASE_STATUS        default completed (completed|draft|halted|inProgress)
 */
const fs = require('fs')
const path = require('path')

function loadServiceAccount(keyFile) {
  const resolved = path.resolve(keyFile)
  if (!fs.existsSync(resolved)) {
    console.error(
      `Set PLAY_SERVICE_ACCOUNT_JSON to an existing service account JSON file.\nNot found: ${resolved}`,
    )
    process.exit(1)
  }

  let json
  try {
    json = JSON.parse(fs.readFileSync(resolved, 'utf8'))
  } catch (err) {
    console.error(`Invalid JSON in ${resolved}: ${err.message}`)
    process.exit(1)
  }

  const hasCreds =
    typeof json.client_email === 'string' &&
    json.client_email.length > 0 &&
    typeof json.private_key === 'string' &&
    json.private_key.length > 0

  if (!hasCreds || json.type !== 'service_account') {
    const basename = path.basename(resolved)
    console.error(`Play upload needs a Google Cloud *service account key* JSON.`)
    console.error(`File: ${resolved}`)
    console.error(
      `Expected type "service_account" with client_email + private_key; got type=${JSON.stringify(json.type ?? null)}, client_email=${!!json.client_email}, private_key=${!!json.private_key}.`,
    )
    if (
      basename === 'google-services.json' ||
      basename === 'firebase.google-services.json' ||
      json.project_info ||
      json.client?.[0]?.oauth_client
    ) {
      console.error(
        `\n"${basename}" looks like a Firebase Android config — that is not a Play upload credential.`,
      )
    }
    if (json.installed || json.web) {
      console.error(
        `\nThis looks like an OAuth client secrets file — use a service account key instead.`,
      )
    }
    console.error(`
Create one:
  1. Google Cloud Console → IAM → Service Accounts → Create (or pick one)
  2. Keys → Add key → JSON
  3. Play Console → Users and permissions → Invite user → that service account email
     with "Release to testing tracks" (or broader) permission
  4. Set in .env.local:
       PLAY_SERVICE_ACCOUNT_JSON=private_keys/play-service-account.json
`)
    process.exit(1)
  }

  return resolved
}

async function main() {
  const aabPath = process.argv[2]
  if (!aabPath) {
    console.error('Usage: node scripts/upload_play.js <path-to.aab>')
    process.exit(1)
  }
  if (!fs.existsSync(aabPath)) {
    console.error(`AAB not found: ${aabPath}`)
    process.exit(1)
  }

  const keyFile = process.env.PLAY_SERVICE_ACCOUNT_JSON
  if (!keyFile) {
    console.error(
      'Set PLAY_SERVICE_ACCOUNT_JSON to an existing service account JSON file.',
    )
    process.exit(1)
  }
  const resolvedKeyFile = loadServiceAccount(keyFile)

  let google
  try {
    ;({ google } = require('googleapis'))
  } catch {
    console.error(
      "Missing dependency 'googleapis'. Run: npm install --save-dev googleapis",
    )
    process.exit(1)
  }

  const packageName = process.env.PLAY_PACKAGE_NAME || 'com.umpire'
  const track = process.env.PLAY_TRACK || 'internal'
  const status = process.env.PLAY_RELEASE_STATUS || 'completed'

  const auth = new google.auth.GoogleAuth({
    keyFile: resolvedKeyFile,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  })
  const androidpublisher = google.androidpublisher({ version: 'v3', auth })

  console.log(`Creating Play edit for ${packageName}…`)
  const edit = await androidpublisher.edits.insert({ packageName })
  const editId = edit.data.id

  console.log(`Uploading ${aabPath}…`)
  const bundle = await androidpublisher.edits.bundles.upload({
    packageName,
    editId,
    media: {
      mimeType: 'application/octet-stream',
      body: fs.createReadStream(aabPath),
    },
  })

  const versionCode = bundle.data.versionCode
  console.log(`Uploaded versionCode ${versionCode}; assigning to track "${track}" (${status})…`)

  await androidpublisher.edits.tracks.update({
    packageName,
    editId,
    track,
    requestBody: {
      track,
      releases: [
        {
          versionCodes: [String(versionCode)],
          status,
        },
      ],
    },
  })

  await androidpublisher.edits.commit({ packageName, editId })
  console.log('Play upload committed.')
}

main().catch((err) => {
  console.error(err.response?.data || err)
  process.exit(1)
})
