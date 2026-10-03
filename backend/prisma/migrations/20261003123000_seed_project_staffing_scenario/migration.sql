-- Demo scenario: a project with teams, minimum staffing, and engineers.
--
-- Everything here is idempotent and self-contained. It creates the
-- departments and leave types it needs rather than assuming the seed has
-- run, so it works on a database that has only ever had migrations applied
-- and changes nothing on one that is already populated.
--
-- The situation it builds, which is the one worth testing:
--
--   Apollo Platform · Tech   minimum 4, eight members
--     5 Backend Engineers, 3 Frontend Engineers
--     Hamza Iqbal  (Backend)  already off 19-23 Oct 2026
--     Zainab Noor  (Frontend) already off 20-22 Oct 2026
--
--   A third request across those dates leaves 5 of 8 available against a
--   minimum of 4, so it is approved automatically. The fifth would leave 3,
--   and is held for HR instead.

-- ── Reference data this scenario needs ────────────────────────────────

INSERT IGNORE INTO `departments` (`name`) VALUES ('Engineering'), ('Marketing');

INSERT IGNORE INTO `leave_types` (`name`, `annual_quota`, `is_paid`) VALUES
  ('Annual', 14, 1),
  ('Sick', 10, 1),
  ('Casual', 6, 1),
  ('Unpaid', 0, 0);

-- ── People ────────────────────────────────────────────────────────────

INSERT IGNORE INTO `employees`
  (`employee_code`, `first_name`, `last_name`, `email`, `department_id`,
   `designation`, `joining_date`, `employment_status`, `base_salary`, `allowances`,
   `created_at`, `updated_at`)
VALUES
  ('EMP-0101', 'Hamza', 'Iqbal', 'hamza@cadre.local', (SELECT id FROM departments WHERE name = 'Engineering'), 'Backend Engineer', '2024-04-01', 'ACTIVE', 140000.00, 0.00, NOW(3), NOW(3)),
  ('EMP-0102', 'Noman', 'Sadiq', 'noman@cadre.local', (SELECT id FROM departments WHERE name = 'Engineering'), 'Backend Engineer', '2024-04-01', 'ACTIVE', 132000.00, 0.00, NOW(3), NOW(3)),
  ('EMP-0103', 'Rizwan', 'Butt', 'rizwan@cadre.local', (SELECT id FROM departments WHERE name = 'Engineering'), 'Backend Engineer', '2024-04-01', 'ACTIVE', 128000.00, 0.00, NOW(3), NOW(3)),
  ('EMP-0104', 'Saad', 'Mahmood', 'saad@cadre.local', (SELECT id FROM departments WHERE name = 'Engineering'), 'Backend Engineer', '2024-04-01', 'ACTIVE', 118000.00, 0.00, NOW(3), NOW(3)),
  ('EMP-0105', 'Junaid', 'Akhtar', 'junaid@cadre.local', (SELECT id FROM departments WHERE name = 'Engineering'), 'Backend Engineer', '2024-04-01', 'ACTIVE', 112000.00, 0.00, NOW(3), NOW(3)),
  ('EMP-0106', 'Zainab', 'Noor', 'zainab@cadre.local', (SELECT id FROM departments WHERE name = 'Engineering'), 'Frontend Engineer', '2024-04-01', 'ACTIVE', 126000.00, 0.00, NOW(3), NOW(3)),
  ('EMP-0107', 'Areeba', 'Qureshi', 'areeba@cadre.local', (SELECT id FROM departments WHERE name = 'Engineering'), 'Frontend Engineer', '2024-04-01', 'ACTIVE', 115000.00, 0.00, NOW(3), NOW(3)),
  ('EMP-0108', 'Hira', 'Siddiqi', 'hira@cadre.local', (SELECT id FROM departments WHERE name = 'Engineering'), 'Frontend Engineer', '2024-04-01', 'ACTIVE', 108000.00, 0.00, NOW(3), NOW(3)),
  ('EMP-0109', 'Mehwish', 'Abbas', 'mehwish@cadre.local', (SELECT id FROM departments WHERE name = 'Marketing'), 'Marketing Specialist', '2024-04-01', 'ACTIVE', 82000.00, 0.00, NOW(3), NOW(3)),
  ('EMP-0110', 'Adnan', 'Shah', 'adnan@cadre.local', (SELECT id FROM departments WHERE name = 'Marketing'), 'Content Strategist', '2024-04-01', 'ACTIVE', 76000.00, 0.00, NOW(3), NOW(3));

-- Password for every demo account below: Emp@12345
INSERT IGNORE INTO `users` (`employee_id`, `email`, `password_hash`, `role`, `is_active`)
VALUES
  ((SELECT id FROM employees WHERE employee_code = 'EMP-0101'), 'hamza@cadre.local', '$2b$12$RmpogzTNPK/7sovxXGCyVO0HNV8YpngxE9QRC41Pyoj20E9pqcrOa', 'EMPLOYEE', 1),
  ((SELECT id FROM employees WHERE employee_code = 'EMP-0102'), 'noman@cadre.local', '$2b$12$RmpogzTNPK/7sovxXGCyVO0HNV8YpngxE9QRC41Pyoj20E9pqcrOa', 'EMPLOYEE', 1),
  ((SELECT id FROM employees WHERE employee_code = 'EMP-0103'), 'rizwan@cadre.local', '$2b$12$RmpogzTNPK/7sovxXGCyVO0HNV8YpngxE9QRC41Pyoj20E9pqcrOa', 'EMPLOYEE', 1),
  ((SELECT id FROM employees WHERE employee_code = 'EMP-0104'), 'saad@cadre.local', '$2b$12$RmpogzTNPK/7sovxXGCyVO0HNV8YpngxE9QRC41Pyoj20E9pqcrOa', 'EMPLOYEE', 1),
  ((SELECT id FROM employees WHERE employee_code = 'EMP-0105'), 'junaid@cadre.local', '$2b$12$RmpogzTNPK/7sovxXGCyVO0HNV8YpngxE9QRC41Pyoj20E9pqcrOa', 'EMPLOYEE', 1),
  ((SELECT id FROM employees WHERE employee_code = 'EMP-0106'), 'zainab@cadre.local', '$2b$12$RmpogzTNPK/7sovxXGCyVO0HNV8YpngxE9QRC41Pyoj20E9pqcrOa', 'EMPLOYEE', 1),
  ((SELECT id FROM employees WHERE employee_code = 'EMP-0107'), 'areeba@cadre.local', '$2b$12$RmpogzTNPK/7sovxXGCyVO0HNV8YpngxE9QRC41Pyoj20E9pqcrOa', 'EMPLOYEE', 1),
  ((SELECT id FROM employees WHERE employee_code = 'EMP-0108'), 'hira@cadre.local', '$2b$12$RmpogzTNPK/7sovxXGCyVO0HNV8YpngxE9QRC41Pyoj20E9pqcrOa', 'EMPLOYEE', 1),
  ((SELECT id FROM employees WHERE employee_code = 'EMP-0109'), 'mehwish@cadre.local', '$2b$12$RmpogzTNPK/7sovxXGCyVO0HNV8YpngxE9QRC41Pyoj20E9pqcrOa', 'EMPLOYEE', 1),
  ((SELECT id FROM employees WHERE employee_code = 'EMP-0110'), 'adnan@cadre.local', '$2b$12$RmpogzTNPK/7sovxXGCyVO0HNV8YpngxE9QRC41Pyoj20E9pqcrOa', 'EMPLOYEE', 1);

-- A full year's entitlement of every leave type, for everyone just added.
INSERT IGNORE INTO `leave_balances` (`employee_id`, `leave_type_id`, `year`, `allocated`, `used`)
SELECT e.`id`, lt.`id`, YEAR(CURDATE()), lt.`annual_quota`, 0
FROM `employees` e
CROSS JOIN `leave_types` lt
WHERE e.`employee_code` BETWEEN 'EMP-0101' AND 'EMP-0110';

-- ── The project ───────────────────────────────────────────────────────

-- `updated_at` is set explicitly throughout: Prisma applies @updatedAt from
-- the client, so the column has no database default and a raw INSERT would
-- leave a zero date behind.
INSERT IGNORE INTO `projects`
  (`name`, `code`, `description`, `status`, `start_date`, `created_at`, `updated_at`)
VALUES (
  'Apollo Platform', 'APL-001',
  'Customer-facing platform rebuild. Used to demonstrate per-team minimum staffing.',
  'ACTIVE', '2026-01-15', NOW(3), NOW(3)
);

-- Each team carries its own minimum: a marketing team of two and an
-- engineering team of eight do not need the same cover.
INSERT IGNORE INTO `project_teams`
  (`project_id`, `name`, `department_id`, `minimum_staff`, `created_at`, `updated_at`)
VALUES
  ((SELECT id FROM projects WHERE code = 'APL-001'), 'Tech',
   (SELECT id FROM departments WHERE name = 'Engineering'), 4, NOW(3), NOW(3)),
  ((SELECT id FROM projects WHERE code = 'APL-001'), 'Marketing',
   (SELECT id FROM departments WHERE name = 'Marketing'), 2, NOW(3), NOW(3)),
  ((SELECT id FROM projects WHERE code = 'APL-001'), 'Finance',
   (SELECT id FROM departments WHERE name = 'Finance'), 1, NOW(3), NOW(3));

INSERT IGNORE INTO `project_team_members` (`project_team_id`, `employee_id`, `role_on_team`)
VALUES
  ((SELECT t.id FROM project_teams t JOIN projects p ON p.id = t.project_id WHERE p.code = 'APL-001' AND t.name = 'Tech'), (SELECT id FROM employees WHERE employee_code = 'EMP-0101'), 'Backend Engineer'),
  ((SELECT t.id FROM project_teams t JOIN projects p ON p.id = t.project_id WHERE p.code = 'APL-001' AND t.name = 'Tech'), (SELECT id FROM employees WHERE employee_code = 'EMP-0102'), 'Backend Engineer'),
  ((SELECT t.id FROM project_teams t JOIN projects p ON p.id = t.project_id WHERE p.code = 'APL-001' AND t.name = 'Tech'), (SELECT id FROM employees WHERE employee_code = 'EMP-0103'), 'Backend Engineer'),
  ((SELECT t.id FROM project_teams t JOIN projects p ON p.id = t.project_id WHERE p.code = 'APL-001' AND t.name = 'Tech'), (SELECT id FROM employees WHERE employee_code = 'EMP-0104'), 'Backend Engineer'),
  ((SELECT t.id FROM project_teams t JOIN projects p ON p.id = t.project_id WHERE p.code = 'APL-001' AND t.name = 'Tech'), (SELECT id FROM employees WHERE employee_code = 'EMP-0105'), 'Backend Engineer'),
  ((SELECT t.id FROM project_teams t JOIN projects p ON p.id = t.project_id WHERE p.code = 'APL-001' AND t.name = 'Tech'), (SELECT id FROM employees WHERE employee_code = 'EMP-0106'), 'Frontend Engineer'),
  ((SELECT t.id FROM project_teams t JOIN projects p ON p.id = t.project_id WHERE p.code = 'APL-001' AND t.name = 'Tech'), (SELECT id FROM employees WHERE employee_code = 'EMP-0107'), 'Frontend Engineer'),
  ((SELECT t.id FROM project_teams t JOIN projects p ON p.id = t.project_id WHERE p.code = 'APL-001' AND t.name = 'Tech'), (SELECT id FROM employees WHERE employee_code = 'EMP-0108'), 'Frontend Engineer'),
  ((SELECT t.id FROM project_teams t JOIN projects p ON p.id = t.project_id WHERE p.code = 'APL-001' AND t.name = 'Marketing'), (SELECT id FROM employees WHERE employee_code = 'EMP-0109'), 'Marketing Specialist'),
  ((SELECT t.id FROM project_teams t JOIN projects p ON p.id = t.project_id WHERE p.code = 'APL-001' AND t.name = 'Marketing'), (SELECT id FROM employees WHERE employee_code = 'EMP-0110'), 'Content Strategist');

-- Fatima already exists from the seed; she covers Finance on her own, which
-- is why that team's minimum is 1.
INSERT IGNORE INTO `project_team_members` (`project_team_id`, `employee_id`, `role_on_team`)
SELECT
  (SELECT t.id FROM project_teams t JOIN projects p ON p.id = t.project_id
   WHERE p.code = 'APL-001' AND t.name = 'Finance'),
  e.`id`, e.`designation`
FROM `employees` e
WHERE e.`employee_code` = 'EMP-0005';

-- ── Two people already off across the same dates ──────────────────────
-- No unique key on leave_requests, so each insert is guarded by its own
-- NOT EXISTS rather than by INSERT IGNORE.

INSERT INTO `leave_requests`
  (`employee_id`, `leave_type_id`, `start_date`, `end_date`, `days`, `reason`,
   `status`, `reviewed_at`, `auto_approved`, `created_at`)
SELECT
  e.`id`, lt.`id`, '2026-10-19', '2026-10-23', 5.0,
  'Pre-booked family trip, confirmed with the team last month.',
  'APPROVED', NOW(), 0, NOW()
FROM `employees` e CROSS JOIN `leave_types` lt
WHERE e.`employee_code` = 'EMP-0101' AND lt.`name` = 'Annual'
  AND NOT EXISTS (
    SELECT 1 FROM `leave_requests` r
    WHERE r.`employee_id` = e.`id` AND r.`start_date` = '2026-10-19'
  );

INSERT INTO `leave_requests`
  (`employee_id`, `leave_type_id`, `start_date`, `end_date`, `days`, `reason`,
   `status`, `reviewed_at`, `auto_approved`, `created_at`)
SELECT
  e.`id`, lt.`id`, '2026-10-20', '2026-10-22', 3.0,
  'Sister getting married, travelling the day before.',
  'APPROVED', NOW(), 0, NOW()
FROM `employees` e CROSS JOIN `leave_types` lt
WHERE e.`employee_code` = 'EMP-0106' AND lt.`name` = 'Annual'
  AND NOT EXISTS (
    SELECT 1 FROM `leave_requests` r
    WHERE r.`employee_id` = e.`id` AND r.`start_date` = '2026-10-20'
  );

-- Approved leave is spent balance, and the days are ON_LEAVE attendance so
-- they leave the attendance denominator rather than counting as absence.
UPDATE `leave_balances` b
JOIN `employees` e ON e.`id` = b.`employee_id`
JOIN `leave_types` lt ON lt.`id` = b.`leave_type_id`
SET b.`used` = 5.0
WHERE e.`employee_code` = 'EMP-0101' AND lt.`name` = 'Annual'
  AND b.`year` = YEAR(CURDATE()) AND b.`used` = 0;

UPDATE `leave_balances` b
JOIN `employees` e ON e.`id` = b.`employee_id`
JOIN `leave_types` lt ON lt.`id` = b.`leave_type_id`
SET b.`used` = 3.0
WHERE e.`employee_code` = 'EMP-0106' AND lt.`name` = 'Annual'
  AND b.`year` = YEAR(CURDATE()) AND b.`used` = 0;
