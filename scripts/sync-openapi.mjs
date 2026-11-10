#!/usr/bin/env node
/**
 * Downloads the live OpenAPI schema into docs/openapi.json.
 *
 * Usage:
 *   npm run sync:openapi
 *   REYVO_API_ORIGIN=http://localhost:8001 npm run sync:openapi
 */
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ORIGIN = (process.env.REYVO_API_ORIGIN || 'http://localhost:8000').replace(/\/+$/, '')
const TARGET = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'openapi.json')

async function main() {
  const response = await fetch(`${ORIGIN}/openapi.json`, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`GET ${ORIGIN}/openapi.json failed with ${response.status}`)
  }

  const schema = await response.json()
  await writeFile(TARGET, `${JSON.stringify(schema, null, 2)}\n`, 'utf8')

  console.log(
    `Saved ${Object.keys(schema.paths ?? {}).length} paths and ` +
      `${Object.keys(schema.components?.schemas ?? {}).length} schemas to docs/openapi.json`,
  )
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
