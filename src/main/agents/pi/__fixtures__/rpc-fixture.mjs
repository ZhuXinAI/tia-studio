import readline from 'node:readline'

const reader = readline.createInterface({ input: process.stdin })
reader.on('line', (line) => {
  const command = JSON.parse(line)
  if (command.type === 'hang') return
  if (command.type === 'malformed') {
    process.stdout.write('{bad json}\n')
    return
  }
  if (command.type === 'exit') {
    process.exit(7)
  }
  const delay = Number(command.delay ?? 0)
  setTimeout(() => {
    process.stdout.write(
      `${JSON.stringify({ id: command.id, type: 'response', command: command.type, success: true, data: command.value })}\n`
    )
  }, delay)
})
