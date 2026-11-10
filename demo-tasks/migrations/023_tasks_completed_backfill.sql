-- Analytics needs tasks.completed_at (column exists since 003, set on transition to done).
-- Backfill: done tasks without completed_at get updated_at (best available approximation).
-- Only fills NULLs; updated_at is kept unchanged. No data is removed.
UPDATE tasks SET completed_at = updated_at, updated_at = updated_at
WHERE status = 'done' AND completed_at IS NULL;
