-- AlterTable
ALTER TABLE `applications` ADD COLUMN `candidate_address` VARCHAR(255) NULL,
    ADD COLUMN `current_salary` DECIMAL(12, 2) NULL,
    ADD COLUMN `expected_salary` DECIMAL(12, 2) NULL,
    ADD COLUMN `stated_years_experience` DECIMAL(4, 1) NULL;
