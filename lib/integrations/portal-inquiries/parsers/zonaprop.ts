import type { ParsedInquiry, RawEmail } from '../types'
import { parseContactPortal } from './contact-portal'

export function parseZonaprop(email: RawEmail): ParsedInquiry {
  return parseContactPortal(email, 'zonaprop', ['zonaprop.com', 'zonaprop.com.ar'])
}
