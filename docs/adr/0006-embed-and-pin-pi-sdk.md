# Embed and pin the Pi SDK

TIA Studio bundles an exact `@earendil-works/pi-coding-agent` version and hosts it directly in Electron main with `ModelRuntime`, `SessionManager`, and `createAgentSession`. It never launches the Pi CLI or an RPC child process, never requires a global `pi` or Node executable, and keeps upgrades reproducible and tied to the app release.
