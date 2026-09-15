import type { JobItem, SyncState } from '../types';

/**
 * Fold a server job list into the local one WITHOUT losing work that has not
 * reached the server yet.
 *
 * WHY THIS IS NOT `setJobs(serverJobs)`. A job the worker records offline lives
 * in React state and in the outbox, not in the database - see handleSaveJob in
 * App.tsx, which queues rather than posts precisely so that an absent network
 * cannot delete a job somebody just wrote down. Replacing the list with the
 * server's answer would take that job off the screen while it was still sitting
 * in the queue, and a money record that vanishes and reappears is worse than
 * one that is simply slow.
 *
 * That hazard existed before live updates: the mount-time load replaced the
 * list too. It was narrow because it happened once, with the outbox usually
 * flushing moments later. Polling turns a one-off flicker into a recurring one,
 * which is why this function exists now rather than then.
 *
 * THE SERVER WINS FOR ANYTHING IT KNOWS ABOUT. A job present in both lists
 * takes the server's copy - that is the whole point of refreshing, and the
 * server's status and stateHistory are authoritative. Only jobs the server has
 * never heard of are preserved, and only while the outbox still considers them
 * unsynced. A local job the outbox calls 'synced' that is nonetheless absent
 * from the server response has been deleted or was never really accepted, and
 * keeping it would be inventing a record.
 *
 * Order follows the server's, with surviving local-only jobs in front. They are
 * the newest thing the worker did, and both list endpoints sort newest first.
 */
export function mergeServerJobs(
  serverJobs: JobItem[],
  localJobs: JobItem[],
  syncStateOf: (recordId: string) => SyncState,
): JobItem[] {
  const onServer = new Set(serverJobs.map((j) => j.id));
  const unsyncedLocalOnly = localJobs.filter(
    (j) => !onServer.has(j.id) && syncStateOf(j.id) !== 'synced',
  );
  return [...unsyncedLocalOnly, ...serverJobs];
}
