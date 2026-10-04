-- Two open roles, so a fresh checkout has a careers page with something on
-- it and the whole pipeline can be walked through without anybody typing a
-- job description first.
--
-- Idempotent, and self-contained: it creates the departments it needs
-- rather than assuming the seed has run.
--
-- Dates are relative to the day this runs. A fixed October would be in the
-- past for anyone cloning later, and a posting whose interview window has
-- already passed is open, advertised and unbookable.
--
-- The interview SLOTS are not created here. They are derived from the
-- window by `InterviewService.onModuleInit`, which runs on boot and lays
-- out any posting that has a window but no future times — the arithmetic
-- (weekends, breaks, the timezone the hours are written in) belongs in
-- tested TypeScript, not in SQL.

INSERT IGNORE INTO `departments` (`name`) VALUES ('Engineering');

INSERT IGNORE INTO `job_postings` (
  `code`, `title`, `department_id`, `description`, `required_skills`,
  `min_years_experience`, `shortlist_threshold`, `status`, `opened_at`,
  `location`, `employment_type`, `work_mode`, `salary_range`, `advert_intro`,
  `interview_from`, `interview_to`,
  `interview_start_hour`, `interview_end_hour`,
  `break_start_hour`, `break_end_hour`, `slot_minutes`,
  `created_at`, `updated_at`
) VALUES
(
  'FS-100', 'Full Stack Developer',
  (SELECT id FROM departments WHERE name = 'Engineering'),
  'Build, maintain and optimise web applications across the MERN stack. You will work in React.js on the front end and Node.js with Express.js on the back end, against MongoDB, and build pages in Next.js. The role involves integrating third-party APIs, including Stripe for payments. We are looking for strong problem-solving and a real understanding of clean, scalable code rather than familiarity with any one library.',
  '["React.js","Node.js","Express.js","MongoDB","Next.js","Stripe"]',
  2, 70, 'OPEN', NOW(3),
  'Islamabad, Pakistan', 'FULL_TIME', 'ON_SITE', NULL,
  'We are looking for a skilled and motivated Full Stack Developer to join our team. If you are passionate about web development and looking for an opportunity to grow, we would love to hear from you.',
  CURDATE() + INTERVAL 7 DAY, CURDATE() + INTERVAL 18 DAY,
  10, 17, 13, 14, 60,
  NOW(3), NOW(3)
),
(
  'BE-100', 'Senior Backend Engineer',
  (SELECT id FROM departments WHERE name = 'Engineering'),
  'Own the payroll and leave services end to end. You will build and maintain NestJS services in TypeScript, work with Prisma against MySQL, and help move the platform onto Kubernetes. We care about tested code and clear reasoning more than framework trivia: if you can explain why you built something a particular way, that matters more to us than which library you reached for.',
  '["TypeScript","NestJS","Prisma","MySQL","Docker","Kubernetes"]',
  5, 75, 'OPEN', NOW(3),
  'Islamabad, Pakistan', 'FULL_TIME', 'HYBRID', NULL,
  'We are looking for a backend engineer who wants real ownership rather than tickets off a board. You will set the patterns the rest of the team builds against.',
  CURDATE() + INTERVAL 7 DAY, CURDATE() + INTERVAL 18 DAY,
  10, 17, 13, 14, 60,
  NOW(3), NOW(3)
);
