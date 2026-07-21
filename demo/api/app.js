import { appendFile } from 'node:fs/promises'
import { createServer } from 'node:http'

const startedAt = new Date().toISOString()
await appendFile('/data/starts.jsonl', `${JSON.stringify({ process: 'api', startedAt })}\n`)
console.log(JSON.stringify({ event: 'api.started', startedAt }))

createServer((request, response) => {
  response.setHeader('content-type', 'application/json')
  if (request.url === '/health') {
    response.end(JSON.stringify({ ok: true }))
    return
  }
  if (request.url === '/time') {
    response.end(JSON.stringify({ logicalTime: new Date().toISOString(), epochMs: Date.now() }))
    return
  }
  response.statusCode = 404
  response.end(JSON.stringify({ error: 'not_found' }))
}).listen(3000, '0.0.0.0')
