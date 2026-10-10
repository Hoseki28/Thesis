/**
 * @deprecated MIN-03: This component is orphaned and deprecated in favor of `src/components/LogsTab.tsx`.
 * Kept only for historical backwards compatibility with legacy branch stubs.
 */

import { LogsTab } from './LogsTab'

export interface ServiceLogsTabProps {
  [key: string]: any
}

/**
 * @deprecated Use `LogsTab` instead.
 */
export function ServiceLogsTab(props: ServiceLogsTabProps) {
  console.warn('[DEPRECATED] ServiceLogsTab is deprecated. Please use LogsTab instead.')
  // @ts-ignore
  return <LogsTab {...props} />
}
