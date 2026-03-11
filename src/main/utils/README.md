# Logger Utility

Simple log level utility for controlling console output verbosity.

## Usage

```typescript
import { logger } from './utils/logger'

logger.debug('Detailed debug info', { data: 'value' })
logger.info('General information', { status: 'ok' })
logger.warn('Warning message', { issue: 'minor' })
logger.error('Error occurred', { error: 'details' })
```

## Log Levels

Set the `LOG_LEVEL` environment variable to control which logs are shown:

- `debug` - Show all logs (debug, info, warn, error)
- `info` - Show info, warn, and error (default)
- `warn` - Show warn and error only
- `error` - Show error only

## Examples

```bash
# Show all debug logs
LOG_LEVEL=debug pnpm run dev

# Show only warnings and errors
LOG_LEVEL=warn pnpm run dev

# Default (info level)
pnpm run dev
```
