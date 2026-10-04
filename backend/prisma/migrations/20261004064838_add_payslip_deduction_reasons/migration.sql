-- AlterTable
ALTER TABLE `payslips` ADD COLUMN `bonus_reason` VARCHAR(255) NULL,
    ADD COLUMN `leave_deduction_note` VARCHAR(500) NULL,
    ADD COLUMN `other_deductions_reason` VARCHAR(255) NULL;
