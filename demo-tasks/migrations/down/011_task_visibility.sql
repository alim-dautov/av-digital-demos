SET @demo_dept := (SELECT id FROM departments ORDER BY sort_order, id LIMIT 1);

UPDATE task_templates SET department_id = @demo_dept WHERE department_id IS NULL AND @demo_dept IS NOT NULL;

UPDATE tasks SET department_id = @demo_dept WHERE department_id IS NULL AND @demo_dept IS NOT NULL;

ALTER TABLE task_templates MODIFY COLUMN department_id INT UNSIGNED NOT NULL;

ALTER TABLE tasks MODIFY COLUMN department_id INT UNSIGNED NOT NULL;

ALTER TABLE users DROP COLUMN see_all_tasks;
