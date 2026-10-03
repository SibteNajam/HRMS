-- CreateTable
CREATE TABLE `leave_recommendations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `leave_request_id` INTEGER NOT NULL,
    `verdict` ENUM('APPROVE', 'REVIEW', 'REJECT') NOT NULL,
    `confidence` ENUM('HIGH', 'MEDIUM', 'LOW') NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `basis` JSON NULL,
    `adjusted` VARCHAR(255) NULL,
    `model` VARCHAR(80) NOT NULL,
    `facts_hash` CHAR(40) NOT NULL,
    `generated_by` INTEGER NOT NULL,
    `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `leave_recommendations_leave_request_id_key`(`leave_request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `leave_recommendations` ADD CONSTRAINT `leave_recommendations_leave_request_id_fkey` FOREIGN KEY (`leave_request_id`) REFERENCES `leave_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
