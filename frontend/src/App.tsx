import { useState } from 'react'
import { ArrowRight, Check, Clock3, Copy, GitFork, PackageOpen, TerminalSquare } from 'lucide-react'

const repository = 'https://github.com/AceVikings/chronolab'

const commands = {
  install: 'npm install -g https://github.com/AceVikings/chronolab/releases/download/v0.2.0/chronolab-0.2.0.tgz',
  build: 'chrono build -f Dockerfile -t billing-api:chrono .',
  run: 'chrono run billing-api:chrono --at 2026-01-01T00:00:00Z',
  advance: 'chrono advance 30d',
}

const features = [
  { index: '01', name: 'Transparent image wrapping', tag: 'build', command: 'chrono build', description: 'Builds the original Dockerfile under an internal content tag, detects Linux architecture, injects the matching glibc shim, and preserves the final image entrypoint, command, user, ports, and environment.' },
  { index: '02', name: 'Deterministic clock jumps', tag: 'time', command: 'chrono advance 30d', description: 'Atomically writes a new UTC clock generation, restarts only controlled containers in configured order, and probes every process before reporting success.' },
  { index: '03', name: 'Accelerated application time', tag: 'time', command: 'chrono warp 3600x', description: 'Runs the existing application process against a faster wall clock for timer-driven scenarios. No runtime package, import, or application source change is required.' },
  { index: '04', name: 'Compose orchestration', tag: 'docker', command: 'chrono compose up', description: 'Synchronizes multiple controlled services while passive dependencies such as Postgres and Redis remain running on real server time.' },
  { index: '05', name: 'Stripe Test Clocks', tag: 'provider', command: 'chrono stripe create', description: 'Creates or attaches sandbox clocks, advances Stripe before local services, waits for ready status, and refuses live-mode credentials and objects.' },
  { index: '06', name: 'Ordered webhook buffering', tag: 'provider', command: 'chrono stripe listen', description: 'Accepts Stripe payloads on localhost, buffers their original bytes during an advance, then forwards them in order after applications are verified.' },
  { index: '07', name: 'Compatibility doctor', tag: 'diagnostics', command: 'chrono doctor', description: 'Checks wrapper labels, platform, glibc compatibility, and observed realtime behavior. Unsupported images fail loudly with stable diagnostic codes.' },
  { index: '08', name: 'Agent-ready operations', tag: 'automation', command: 'chrono mcp serve', description: 'Adds stable JSON output, structured event logs, diagnostic exports, and MCP tools for reading, setting, and advancing logical time.' },
  { index: '09', name: 'Persistent run state', tag: 'state', command: 'chrono events', description: 'Keeps atomic state, clock generations, generated wrappers, Compose overrides, and append-only events under one inspectable .chronolab directory.' },
  { index: '10', name: 'Scoped safety controls', tag: 'safety', command: 'chrono destroy', description: 'Uses per-run locks and exact Docker labels, never requests CAP_SYS_TIME, retains failure diagnostics, and removes only resources belonging to the selected run.' },
]

function CopyButton({ value, label = 'Copy command' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="copy-button"
      aria-label={copied ? 'Copied' : label}
      aria-live="polite"
    >
      {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

function CodeLine({ prompt = '$', children }: { prompt?: string; children: string }) {
  return (
    <div className="code-line">
      <span className="code-prompt" aria-hidden="true">{prompt}</span>
      <code>{children}</code>
    </div>
  )
}

function App() {
  return (
    <div className="min-h-screen overflow-hidden bg-canvas text-ink antialiased">
      <a className="skip-link" href="#main">Skip to content</a>

      <header className="site-header">
        <div className="page-shell flex h-16 items-center justify-between">
          <a className="brand-link" href="#top" aria-label="ChronoLab home">
            <span className="brand-mark"><Clock3 aria-hidden="true" size={17} /></span>
            <span>ChronoLab</span>
          </a>
          <nav className="flex items-center gap-2" aria-label="Primary navigation">
            <a className="nav-link hidden sm:inline-flex" href="#how-it-works">How it works</a>
            <a className="nav-link hidden md:inline-flex" href="#features">Features</a>
            <a className="nav-link hidden sm:inline-flex" href="#install">Install</a>
            <a className="icon-link" href={repository} target="_blank" rel="noreferrer" aria-label="ChronoLab on GitHub">
              <GitFork aria-hidden="true" size={19} />
            </a>
          </nav>
        </div>
      </header>

      <main id="main">
        <section id="top" className="hero-section">
          <div className="page-shell hero-grid">
            <div className="hero-copy">
              <div className="eyebrow"><span className="status-dot" /> Deterministic time for Docker</div>
              <h1>Move time.<br /><span>Keep everything else.</span></h1>
              <p className="hero-lede">
                Give existing applications a controllable wall clock. Advance subscriptions, expiries, and scheduled jobs by days—without changing app code or touching the host clock.
              </p>
              <div className="hero-actions">
                <a className="primary-button" href="#install">Install ChronoLab <ArrowRight aria-hidden="true" size={17} /></a>
                <a className="secondary-button" href={repository} target="_blank" rel="noreferrer"><GitFork aria-hidden="true" size={17} /> View source</a>
              </div>
              <div className="hero-proof" aria-label="Core guarantees">
                <span>No SDK</span><span>No host clock changes</span><span>Volumes persist</span>
              </div>
            </div>

            <div className="time-console" aria-label="Example ChronoLab terminal session">
              <div className="console-bar">
                <div className="console-title"><TerminalSquare aria-hidden="true" size={15} /> subscription-lab</div>
                <span className="console-mode">jump mode</span>
              </div>
              <div className="console-body">
                <CodeLine>{commands.run}</CodeLine>
                <div className="time-readout">
                  <span>logical time</span>
                  <strong>2026-01-01</strong>
                  <small>00:00:00 UTC</small>
                </div>
                <CodeLine>{commands.advance}</CodeLine>
                <div className="advance-track" aria-hidden="true">
                  <span className="track-start" />
                  <span className="track-line" />
                  <span className="track-end" />
                  <span className="track-label">+30 days</span>
                </div>
                <div className="console-result">
                  <span className="result-check"><Check aria-hidden="true" size={14} /></span>
                  <div><strong>api + worker synchronized</strong><small>2026-01-31 00:00:00 UTC</small></div>
                  <span className="result-duration">2.4s</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="proof-band" aria-label="Technical guarantees">
          <div className="page-shell proof-grid">
            <div><span>01</span><strong>Application time</strong><p><code>Date.now()</code> sees the setup clock.</p></div>
            <div><span>02</span><strong>Monotonic time</strong><p>Timeouts and event loops stay real.</p></div>
            <div><span>03</span><strong>Host time</strong><p>Never modified. No <code>CAP_SYS_TIME</code>.</p></div>
          </div>
        </section>

        <section id="how-it-works" className="content-section">
          <div className="page-shell split-layout">
            <div className="section-heading">
              <div className="eyebrow">How it works</div>
              <h2>A clock layer,<br />not a rewrite.</h2>
              <p>ChronoLab wraps your final Linux image with libfaketime, mounts one inspectable state directory, and restarts only controlled processes when time jumps.</p>
            </div>
            <ol className="process-list">
              <li><span>01</span><div><h3>Wrap the image</h3><p>Your original <code>ENTRYPOINT</code>, <code>CMD</code>, user, ports, and filesystem stay intact.</p></div></li>
              <li><span>02</span><div><h3>Set logical UTC</h3><p>Realtime calls read the mounted clock automatically. Your project imports nothing.</p></div></li>
              <li><span>03</span><div><h3>Jump and verify</h3><p>Controlled services restart, volumes remain, and ChronoLab probes the clock before reporting success.</p></div></li>
            </ol>
          </div>
        </section>

        <section className="runtime-section">
          <div className="page-shell runtime-panel">
            <div className="runtime-copy">
              <div className="eyebrow">Zero application changes</div>
              <h2>Your code asks for time.<br />ChronoLab answers.</h2>
              <p>Dynamic Linux runtimes keep using their normal APIs. The wrapper intercepts wall-clock calls beneath the application layer.</p>
              <div className="runtime-tags" aria-label="Supported runtime clock APIs">
                <code>new Date()</code><code>Date.now()</code><code>time.time()</code><code>Time.now</code><code>time()</code>
              </div>
            </div>
            <div className="clock-contract">
              <div className="contract-row active"><span>clock_realtime</span><strong>controlled</strong></div>
              <div className="contract-row"><span>clock_monotonic</span><strong>real</strong></div>
              <div className="contract-row"><span>host clock</span><strong>untouched</strong></div>
              <div className="contract-row"><span>application SDK</span><strong>none</strong></div>
            </div>
          </div>
        </section>

        <section id="features" className="feature-section">
          <div className="page-shell">
            <div className="feature-heading">
              <div><div className="eyebrow">Complete feature set</div><h2>One clock surface.<br />Every testing layer.</h2></div>
              <p>ChronoLab stays local and inspectable while covering the full path from a single Dockerfile to multi-service and provider-coordinated scenarios.</p>
            </div>
            <div className="feature-ledger">
              {features.map((feature) => (
                <article className="feature-row" key={feature.index}>
                  <div className="feature-meta"><span>{feature.index}</span><small>{feature.tag}</small></div>
                  <div className="feature-content"><h3>{feature.name}</h3><p>{feature.description}</p></div>
                  <code>{feature.command}</code>
                </article>
              ))}
            </div>
            <div className="boundary-note">
              <strong>Deliberate boundaries</strong>
              <p>ChronoLab targets dynamically linked glibc Linux processes. Static binaries, Alpine/musl, passive database expressions, and arbitrary external SaaS clocks are reported as boundaries—not silently simulated.</p>
            </div>
          </div>
        </section>

        <section id="install" className="content-section install-section">
          <div className="page-shell">
            <div className="install-heading">
              <div>
                <div className="eyebrow">Install and run</div>
                <h2>From clone to<br />thirty days later.</h2>
              </div>
              <p>Requires Node.js 20+, Docker, and a dynamically linked glibc Linux image. The first build creates a small local shim.</p>
            </div>
            <div className="install-grid">
              <div className="command-stack">
                {Object.entries(commands).map(([name, command], index) => (
                  <div className="command-row" key={name}>
                    <span className="command-index">0{index + 1}</span>
                    <div><small>{name}</small><CodeLine>{command}</CodeLine></div>
                    <CopyButton value={command} label={`Copy ${name} command`} />
                  </div>
                ))}
              </div>
              <aside className="capability-list" aria-label="Included capabilities">
                <div className="aside-title"><PackageOpen aria-hidden="true" size={18} /> Included in the CLI</div>
                <ul>
                  <li><Check aria-hidden="true" size={15} /> Single images and Docker Compose</li>
                  <li><Check aria-hidden="true" size={15} /> Deterministic jumps and accelerated time</li>
                  <li><Check aria-hidden="true" size={15} /> Stripe sandbox Test Clocks</li>
                  <li><Check aria-hidden="true" size={15} /> JSON output, events, export, and MCP</li>
                  <li><Check aria-hidden="true" size={15} /> Compatibility doctor and safe cleanup</li>
                </ul>
                <a href={`${repository}#readme`} target="_blank" rel="noreferrer">Read the complete CLI guide <ArrowRight aria-hidden="true" size={15} /></a>
              </aside>
            </div>
          </div>
        </section>

        <section className="closing-section">
          <div className="page-shell closing-layout">
            <div><div className="eyebrow">Time is now test data</div><h2>Stop waiting for<br />the calendar.</h2></div>
            <div><p>Reproduce month-end behavior locally, coordinate sandbox clocks, and give agents stable JSON commands—all from the repository you already have.</p><a className="primary-button" href={repository} target="_blank" rel="noreferrer">Get ChronoLab <ArrowRight aria-hidden="true" size={17} /></a></div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="page-shell footer-layout"><span>ChronoLab</span><p>Deterministic wall-clock testing for Docker.</p><a href={repository} target="_blank" rel="noreferrer">MIT licensed · GitHub</a></div>
      </footer>
    </div>
  )
}

export default App
