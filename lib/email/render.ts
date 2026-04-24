import 'server-only'
import { render } from '@react-email/render'
import type { ReactElement } from 'react'

/**
 * Wrapper thin around @react-email/render. Keeps the dep import localized and
 * forces consistent options across templates.
 */
export async function renderEmail(element: ReactElement): Promise<string> {
  return render(element, { pretty: false })
}
