-- AlterTable
ALTER TABLE `job_postings` ADD COLUMN `break_end_hour` TINYINT NULL,
    ADD COLUMN `break_start_hour` TINYINT NULL,
    ADD COLUMN `interview_end_hour` TINYINT NOT NULL DEFAULT 17,
    ADD COLUMN `interview_from` DATE NULL,
    ADD COLUMN `interview_start_hour` TINYINT NOT NULL DEFAULT 10,
    ADD COLUMN `interview_to` DATE NULL,
    ADD COLUMN `slot_minutes` INTEGER NOT NULL DEFAULT 60;
