# Release Process

## Version Management

This project uses semantic versioning (MAJOR.MINOR.PATCH).

### Manual Version Bumping

Use these npm scripts to bump versions:

```bash
# Patch release (0.1.0 -> 0.1.1) - bug fixes
pnpm run version:patch

# Minor release (0.1.0 -> 0.2.0) - new features
pnpm run version:minor

# Major release (0.1.0 -> 1.0.0) - breaking changes
pnpm run version:major
```

These commands will:

1. Update version in package.json
2. Create a git commit
3. Create a git tag (v0.1.1, v0.2.0, etc.)
4. Push commits and tags to GitHub
5. Trigger the release workflow automatically

### Release Workflow

When a tag is pushed (e.g., `v0.1.0`), GitHub Actions will:

1. Build the app for macOS, Windows, and Linux
2. Create installers for each platform
3. Create a GitHub Release with all artifacts
4. Upload the installers to the release

### Manual Release

If you prefer to create releases manually:

```bash
# 1. Update version in package.json
npm version 0.1.0 --no-git-tag-version

# 2. Commit the change
git add package.json
git commit -m "chore: bump version to 0.1.0"

# 3. Create and push tag
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

## First Release

To create your first release (v0.1.0):

```bash
pnpm run version:patch  # This will create v0.1.0 from current 0.1.0
```

Or manually:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Viewing Releases

After the workflow completes, view releases at:
https://github.com/YOUR_USERNAME/tia-studio/releases
