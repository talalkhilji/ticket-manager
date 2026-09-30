import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

const purify = createDOMPurify(new JSDOM('').window)

/**
 * Strips all HTML from user-supplied text and returns plain text (entities decoded, tags and
 * scripts removed), so markup never reaches the database or an outgoing email.
 */
export function sanitizeText(input: string): string {
  const body = purify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [], RETURN_DOM: true })
  return (body.textContent ?? '').trim()
}
