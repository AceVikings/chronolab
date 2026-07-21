const startedAt = new Date().toISOString()
console.log(JSON.stringify({ event: 'worker.started', startedAt }))

setInterval(() => {
  console.log(JSON.stringify({ event: 'worker.tick', logicalTime: new Date().toISOString(), epochMs: Date.now() }))
}, 5_000)
