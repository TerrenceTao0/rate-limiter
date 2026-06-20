"use client";

import { useState } from "react";

//

const endpoints = [
  { path: "/api/fixed-window",  strategy: "Fixed window",  limit: "10 req/min" },
  { path: "/api/sliding-window",  strategy: "Sliding window",  limit: "10 req/min" },
  { path: "/api/token-bucket",  strategy: "Token bucket",  limit: "10 req/min" },
  { path: "/api/leaky-bucket",  strategy: "Leaky bucket",  limit: "10 req/min" },
]

type Metrics = {
  blockRate: number
  timeTaken: number
  allowed: number
  blocked: number
  p50: number
  p95: number
  p99: number
  min: number
  max: number
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1

  return sorted[Math.max(0, idx)]
}

function ms(n: number): string {
  return `${Math.round(n)}ms`
}

//

export default function Home() {
  const [doingFlood, setDoingFlood] = useState(false)
  const [floodResults, setFloodResults] = useState<Metrics | null>(null)
  const [testCount, setTestCount] = useState(50)
  const [selectedEndpoint, setSelectedEndpoint] = useState(endpoints[0].path)

  function calcMetrics(results: { response: Response; duration: number }[], totalTime: number): Metrics {
    const timeTaken = Math.round(totalTime / 10) / 100
    const allowed = results.filter(r => r.response.status === 200).length
    const blocked = results.length - allowed

    const sorted = results.map(r => r.duration).sort((a, b) => a - b)

    return {
      blockRate: Math.round((blocked / results.length) * 100),
      timeTaken,
      allowed,
      blocked,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      min: sorted[0],
      max: sorted[sorted.length - 1],
    }
  }


  async function floodAttack() {
    if (doingFlood) return

    setDoingFlood(true)
    setFloodResults(null)

    const startTime = performance.now()

    const results: { response: Response; duration: number }[] = []
    let remaining = testCount

    async function worker() {
      while (remaining-- > 0) {
        const t0 = performance.now()
        const response = await fetch(selectedEndpoint)
        results.push({ response, duration: performance.now() - t0 })
      }
    }

    await Promise.all(Array.from({ length: Math.min(6, testCount) }, worker))

    setFloodResults(calcMetrics(results, performance.now() - startTime))
    setDoingFlood(false)
  }


  function enterTestCount(event: React.ChangeEvent<HTMLInputElement>) {
    const number = Number(event.target.value)
    if (number) setTestCount(number)
  }


  return (
    <main className="w-full max-w-2xl mx-auto px-6 py-16">

      <header className="mb-12">
        <h1 className="font-jersey text-4xl">
          Rate<span className="text-violet-400">Limiter</span>
        </h1>

        <p className="text-zinc-400 text-sm mt-2 max-w-md">
          Compare rate limiting algorithms under concurrent load. 
          Pick an endpoint and set a request count, to see results.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-sm font-medium text-zinc-300 mb-3">
          Endpoint
        </h2>

        <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800">
          {endpoints.map(ep => (
            <label
              key={ep.path}
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-900/60 first:rounded-t-lg last:rounded-b-lg"
            >
              <input
                type="radio"
                name="endpoint"
                checked={selectedEndpoint === ep.path}
                onChange={() => setSelectedEndpoint(ep.path)}
                className="accent-violet-500"
              />
              <div className="flex-1">
                <div className="font-mono text-sm">
                  {ep.path}
                </div>

                <div className="text-xs text-zinc-500 mt-0.5">
                  {ep.strategy}
                </div>
              </div>

              <div className="text-xs text-zinc-500">
                {ep.limit}
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="flex items-end gap-3 mb-12">
        <div>
          <label htmlFor="request-count" className="block text-sm text-zinc-400 mb-1.5">
            Requests
          </label>
          <input
            id="request-count"
            type="number"
            min={1}
            defaultValue={testCount}
            onChange={enterTestCount}
            className="w-24 bg-transparent border border-zinc-800 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-600"
          />
        </div>
        <button
          onClick={floodAttack}
          disabled={doingFlood}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-default cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors"
        >
          {doingFlood ? "Running…" : "Run test"}
        </button>
      </section>

      {floodResults && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-medium text-zinc-300">
              Results
            </h2>

            <span className="font-mono text-xs text-zinc-500">
              {selectedEndpoint}
            </span>
          </div>

          <div className="border border-zinc-800 rounded-lg p-5">
            <div className="flex h-1.5 rounded-full overflow-hidden bg-zinc-800 mb-5">
              <div
                className="bg-emerald-500"
                style={{ width: `${100 - floodResults.blockRate}%` }}
              />
              <div
                className="bg-red-500"
                style={{ width: `${floodResults.blockRate}%` }}
              />
            </div>

            <dl className="grid grid-cols-4 gap-4 mb-6">
              <div>
                <dt className="text-xs text-zinc-500">
                  Allowed
                </dt>

                <dd className="font-mono text-lg text-emerald-400">
                  {floodResults.allowed}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-zinc-500">
                  Blocked
                </dt>

                <dd className="font-mono text-lg text-red-400">
                  {floodResults.blocked}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-zinc-500">
                  Block rate
                </dt>

                <dd className="font-mono text-lg">
                  {floodResults.blockRate}%
                </dd>
              </div>

              <div>
                <dt className="text-xs text-zinc-500">
                  Duration
                </dt>

                <dd className="font-mono text-lg">
                  {floodResults.timeTaken}s
                </dd>
              </div>
            </dl>

            <div className="pt-4 border-t border-zinc-800">
              <h3 className="text-xs text-zinc-500 mb-2">
                Latency
              </h3>

              <dl className="flex gap-6">
                {[
                  { label: "min", value: ms(floodResults.min) },
                  { label: "p50", value: ms(floodResults.p50) },
                  { label: "p95", value: ms(floodResults.p95) },
                  { label: "p99", value: ms(floodResults.p99) },
                  { label: "max", value: ms(floodResults.max) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-xs text-zinc-500">
                      {label}
                    </dt>

                    <dd className="font-mono text-sm">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      )}

    </main>
  )
}

