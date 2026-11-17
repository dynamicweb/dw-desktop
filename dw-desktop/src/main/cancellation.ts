// Running transfers by job id, so the renderer can cancel a job or a whole batch.
// One controller may cover several jobs (a sync run cancels as a unit).
const controllers = new Map<string, AbortController>()

export function trackJobs(jobIds: string[]): AbortController {
  const controller = new AbortController()
  for (const id of jobIds) controllers.set(id, controller)
  return controller
}

export function releaseJobs(jobIds: string[]): void {
  for (const id of jobIds) controllers.delete(id)
}

export function cancelJobs(jobIds: string[]): void {
  for (const id of jobIds) controllers.get(id)?.abort()
}
