-- Manual local rollback only. NEVER run on production (drops timesheet codes and archive index).
DROP TABLE IF EXISTS attendance_timesheet_archives;
DROP TABLE IF EXISTS attendance_day_codes;
DROP TABLE IF EXISTS attendance_keepers;
DELETE FROM settings WHERE `key` IN ('timesheet_requisites', 'timesheet_archive_from');
ALTER TABLE users DROP COLUMN position;
