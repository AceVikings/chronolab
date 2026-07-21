console.log(JSON.stringify({ startedAt: new Date().toISOString() }));
setInterval(() => console.log(JSON.stringify({ tickAt: new Date().toISOString() })), 1_000);
