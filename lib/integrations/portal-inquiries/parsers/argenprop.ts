import type { ParsedInquiry, RawEmail } from '../types'
import { parseContactPortal } from './contact-portal'

export function parseArgenprop(email: RawEmail): ParsedInquiry {
  return parseContactPortal(email, 'argenprop', ['argenprop.com'])
}
