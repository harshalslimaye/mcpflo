// electron-builder afterSign hook.
//
// We intentionally ship macOS builds without a real Apple Developer ID. Without an
// identity, electron-builder ad-hoc signs the bundle — but to guarantee every nested
// component (the main executable, helpers, and the bundled Electron Framework) carries
// the *same* (ad-hoc, no Team ID) signature, we deep-resign here. macOS on Apple
// Silicon refuses to launch a bundle whose components have mismatched Team IDs, so an
// internally consistent ad-hoc signature is what keeps the app launchable.
//
// This runs after electron-builder signs the .app but BEFORE the .dmg/.zip is created,
// so the consistently-signed bundle is what actually ships.

const { execFileSync } = require('node:child_process')
const path = require('node:path')

/** @param {import('electron-builder').AfterPackContext} context */
exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') {
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)

  console.log(`[afterSign] ad-hoc deep-resigning ${appPath}`)
  execFileSync('codesign', ['--deep', '--force', '--sign', '-', appPath], {
    stdio: 'inherit'
  })

  console.log('[afterSign] verifying signature consistency')
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], {
    stdio: 'inherit'
  })
}
