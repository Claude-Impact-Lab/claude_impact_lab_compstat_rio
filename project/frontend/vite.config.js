import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const PYTHON = path.join(REPO_ROOT, '.venv/bin/python')
const SCRIPT = path.join(REPO_ROOT, 'scripts/build_data.py')

const TOTAL_AREAS = 9
const TOTAL_CALLS = TOTAL_AREAS * 3  // resumo + dinâmica + plano por área

/**
 * Vite plugin that exposes:
 *   POST /api/build         → starts the ETL (build_data.py) as a child process
 *   GET  /api/build/status  → current job state + last N stderr lines + parsed progress
 *
 * Only one job runs at a time. The Anthropic API key must be set in the env
 * where `npm run dev` was launched (the plugin forwards process.env).
 */
function compstatEtlPlugin() {
  let job = null
  // job shape:
  //   { startedAt, lines:[], done:bool, error:string|null,
  //     calls:int, areaCurrent:string|null, sectionCurrent:string|null,
  //     phase:string, exitCode:int|null }

  const appendLine = (line) => {
    if (!line.trim()) return
    job.lines.push(line)
    if (job.lines.length > 200) job.lines.shift()
    // Parse "    [LLM] resumo executivo · {area name}"
    const m = line.match(/\[LLM\]\s+([^·]+)·\s+(.+?)\s*$/)
    if (m) {
      job.calls += 1
      job.sectionCurrent = m[1].trim()
      job.areaCurrent = m[2].trim()
      job.phase = 'llm'
    } else if (line.includes('==> Loading polygons')) {
      job.phase = 'load-polygons'
    } else if (line.includes('==> Loading cameras')) {
      job.phase = 'load-cameras'
    } else if (line.includes('==> Loading ocorrências')) {
      job.phase = 'load-ocorrencias'
    } else if (line.includes('==> Loading disque denúncia')) {
      job.phase = 'load-denuncias'
    } else if (line.includes('==> Loading fatores')) {
      job.phase = 'load-fatores'
    } else if (line.includes('==> Loading RELINTs')) {
      job.phase = 'load-relints'
    } else if (line.includes('==> Wrote')) {
      job.phase = 'wrote'
    }
  }

  const sendJSON = (res, status, body) => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(body))
  }

  return {
    name: 'compstat-etl',
    configureServer(server) {
      server.middlewares.use('/api/build', (req, res, next) => {
        if (req.url !== '' && req.url !== '/' && !req.url.startsWith('?')) {
          // Sub-paths (e.g. /status) — handled below
          if (req.url.startsWith('/status') || req.url === '/status') {
            return sendJSON(res, 200, {
              status: job
                ? job.done
                  ? job.error
                    ? 'error'
                    : 'done'
                  : 'running'
                : 'idle',
              error: job?.error ?? null,
              calls: job?.calls ?? 0,
              totalCalls: TOTAL_CALLS,
              totalAreas: TOTAL_AREAS,
              areaCurrent: job?.areaCurrent ?? null,
              sectionCurrent: job?.sectionCurrent ?? null,
              phase: job?.phase ?? 'idle',
              lines: job?.lines.slice(-25) ?? [],
              startedAt: job?.startedAt ?? null,
              exitCode: job?.exitCode ?? null,
            })
          }
        }

        if (req.method === 'POST') {
          if (job && !job.done) {
            return sendJSON(res, 409, { error: 'already_running' })
          }
          if (!process.env.ANTHROPIC_API_KEY) {
            return sendJSON(res, 400, {
              error: 'missing_api_key',
              message: 'Variável ANTHROPIC_API_KEY não está definida no ambiente do Vite. Reinicie com: ANTHROPIC_API_KEY=sk-ant-... npm run dev',
            })
          }
          job = {
            startedAt: Date.now(),
            lines: [],
            done: false,
            error: null,
            calls: 0,
            areaCurrent: null,
            sectionCurrent: null,
            phase: 'starting',
            exitCode: null,
          }
          appendLine(`==> Starting ETL: ${PYTHON} ${SCRIPT}`)
          const child = spawn(PYTHON, [SCRIPT], {
            cwd: REPO_ROOT,
            env: process.env,
          })
          const handleChunk = (buf) => {
            for (const line of buf.toString().split(/\r?\n/)) appendLine(line)
          }
          child.stdout.on('data', handleChunk)
          child.stderr.on('data', handleChunk)
          child.on('error', (err) => {
            job.error = `spawn failed: ${err.message}`
            job.done = true
          })
          child.on('close', (code) => {
            job.exitCode = code
            job.done = true
            if (code !== 0 && !job.error) job.error = `Python exited with code ${code}`
            appendLine(`==> Exit code: ${code}`)
          })
          return sendJSON(res, 202, { status: 'started', startedAt: job.startedAt })
        }

        if (req.method === 'GET') {
          // Same as /status (alias on the root)
          return sendJSON(res, 200, {
            status: job
              ? job.done
                ? job.error
                  ? 'error'
                  : 'done'
                : 'running'
              : 'idle',
            error: job?.error ?? null,
            calls: job?.calls ?? 0,
            totalCalls: TOTAL_CALLS,
            totalAreas: TOTAL_AREAS,
            areaCurrent: job?.areaCurrent ?? null,
            sectionCurrent: job?.sectionCurrent ?? null,
            phase: job?.phase ?? 'idle',
            lines: job?.lines.slice(-25) ?? [],
            startedAt: job?.startedAt ?? null,
            exitCode: job?.exitCode ?? null,
          })
        }

        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), compstatEtlPlugin()],
  server: {
    port: 5173,
    open: true,
    // Proxy /api → backend FastAPI (project/backend) para evitar CORS na POC.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
