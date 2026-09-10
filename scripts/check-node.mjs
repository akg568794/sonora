/**
 * Fails fast, and readably, on a Node version that can't run this project.
 *
 * This exists because the failure it replaces was genuinely baffling: npm 6 (which
 * ships with Node 14) silently ignores `--workspace`, so a script delegating with
 * `npm run start --workspace server` re-invoked the *root* script instead, forever,
 * appending one more argument each pass. The scripts no longer delegate that way,
 * but a wrong Node still needs to say so plainly.
 *
 * Keep this file to syntax that old Node versions can parse — it has to survive
 * long enough to print its message.
 */
var REQUIRED_MAJOR = 20;
var current = process.versions.node;
var major = Number(current.split('.')[0]);

if (!(major >= REQUIRED_MAJOR)) {
  process.stderr.write(
    '\n  Sonora needs Node ' + REQUIRED_MAJOR + ' or newer — this is Node ' + current + '.\n\n' +
      '    nvm use 22.13.1\n\n' +
      '  Then run the command again. If nvm does not stick in your shell:\n\n' +
      '    export PATH="$LOCALAPPDATA/nvm/v22.13.1:$PATH"\n\n'
  );
  process.exit(1);
}
