import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { env } from '../env.js'

// server/knowledge-base.md, found from this file rather than the working directory.
const knowledgeBasePath = fileURLToPath(new URL('../../knowledge-base.md', import.meta.url))

let cached: { mtimeMs: number; text: string } | null = null

// The knowledge base text. Re-read when the file changes, so edits apply without a restart.
// Empty when the file is missing or blank.
export function getKnowledgeBase(): string {
  try {
    const { mtimeMs } = statSync(knowledgeBasePath)
    if (cached?.mtimeMs !== mtimeMs) {
      cached = { mtimeMs, text: readFileSync(knowledgeBasePath, 'utf8').trim() }
    }
    return cached.text
  } catch {
    cached = null
    return ''
  }
}

// Auto-resolve needs an OpenAI key and a non-empty knowledge base. Without both, new tickets start `open`.
export const isAutoResolveEnabled = () => !!env.OPENAI_API_KEY && getKnowledgeBase().length > 0
