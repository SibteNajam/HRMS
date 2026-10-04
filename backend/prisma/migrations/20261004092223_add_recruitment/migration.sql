-- CreateTable
CREATE TABLE `job_postings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `department_id` INTEGER NULL,
    `description` TEXT NOT NULL,
    `required_skills` JSON NOT NULL,
    `min_years_experience` INTEGER NOT NULL DEFAULT 0,
    `shortlist_threshold` INTEGER NOT NULL DEFAULT 70,
    `status` ENUM('DRAFT', 'OPEN', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `opened_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `job_postings_code_key`(`code`),
    INDEX `job_postings_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `applications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job_posting_id` INTEGER NULL,
    `candidate_name` VARCHAR(120) NOT NULL,
    `candidate_email` VARCHAR(160) NOT NULL,
    `candidate_phone` VARCHAR(40) NULL,
    `source` ENUM('EMAIL', 'FORM', 'MANUAL') NOT NULL DEFAULT 'EMAIL',
    `cv_path` VARCHAR(255) NULL,
    `cv_file_name` VARCHAR(255) NULL,
    `cv_text` TEXT NULL,
    `status` ENUM('RECEIVED', 'SCREENED', 'SHORTLISTED', 'INTERVIEW', 'REJECTED', 'HIRED', 'NEEDS_REVIEW') NOT NULL DEFAULT 'RECEIVED',
    `score` INTEGER NULL,
    `score_reason` VARCHAR(1000) NULL,
    `matched_skills` JSON NULL,
    `missing_skills` JSON NULL,
    `years_experience` DECIMAL(4, 1) NULL,
    `scored_at` DATETIME(3) NULL,
    `decision_note` VARCHAR(500) NULL,
    `booking_token` VARCHAR(64) NOT NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `applications_booking_token_key`(`booking_token`),
    INDEX `applications_job_posting_id_status_idx`(`job_posting_id`, `status`),
    INDEX `applications_candidate_email_idx`(`candidate_email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `interview_slots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job_posting_id` INTEGER NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `interview_slots_starts_at_idx`(`starts_at`),
    UNIQUE INDEX `interview_slots_job_posting_id_starts_at_key`(`job_posting_id`, `starts_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `interviews` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `application_id` INTEGER NOT NULL,
    `slot_id` INTEGER NOT NULL,
    `status` ENUM('SCHEDULED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
    `meeting_link` VARCHAR(400) NULL,
    `notes` TEXT NULL,
    `booked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `interviews_application_id_key`(`application_id`),
    UNIQUE INDEX `interviews_slot_id_key`(`slot_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `job_postings` ADD CONSTRAINT `job_postings_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `applications` ADD CONSTRAINT `applications_job_posting_id_fkey` FOREIGN KEY (`job_posting_id`) REFERENCES `job_postings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `interview_slots` ADD CONSTRAINT `interview_slots_job_posting_id_fkey` FOREIGN KEY (`job_posting_id`) REFERENCES `job_postings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `interviews` ADD CONSTRAINT `interviews_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `interviews` ADD CONSTRAINT `interviews_slot_id_fkey` FOREIGN KEY (`slot_id`) REFERENCES `interview_slots`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
