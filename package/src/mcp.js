import readline from 'node:readline';

const TOOLS = [
  { name: 'chronolab_now', description: 'Read the active ChronoLab logical clock.', inputSchema: { type: 'object', properties: {} } },
  { name: 'chronolab_advance', description: 'Advance the active ChronoLab run by a duration.', inputSchema: { type: 'object', properties: { duration: { type: 'string' } }, required: ['duration'] } },
  { name: 'chronolab_set', description: 'Set the active ChronoLab run to a later UTC timestamp.', inputSchema: { type: 'object', properties: { timestamp: { type: 'string' } }, required: ['timestamp'] } },
  { name: 'chronolab_events', description: 'Read structured events for the active run.', inputSchema: { type: 'object', properties: {} } },
];

export async function serveMcp({ invoke, input = process.stdin, output = process.stdout }) {
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let request;
    try { request = JSON.parse(line); }
    catch { output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`); continue; }
    if (request.method === 'notifications/initialized') continue;
    try {
      let result;
      if (request.method === 'initialize') result = { protocolVersion: request.params?.protocolVersion === '2025-11-25' ? request.params.protocolVersion : '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'chronolab', version: '0.2.0' } };
      else if (request.method === 'tools/list') result = { tools: TOOLS };
      else if (request.method === 'tools/call') {
        const args = request.params?.arguments || {};
        const commands = {
          chronolab_now: ['now'],
          chronolab_advance: ['advance', args.duration],
          chronolab_set: ['set', args.timestamp],
          chronolab_events: ['events'],
        };
        const argv = commands[request.params?.name];
        if (!argv) throw new Error(`Unknown tool: ${request.params?.name}`);
        const value = await invoke(argv);
        result = { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
      } else throw Object.assign(new Error(`Method not found: ${request.method}`), { rpcCode: -32601 });
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
    } catch (error) {
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: error.rpcCode || -32000, message: error.message, data: error.code ? { code: error.code } : undefined } })}\n`);
    }
  }
}
