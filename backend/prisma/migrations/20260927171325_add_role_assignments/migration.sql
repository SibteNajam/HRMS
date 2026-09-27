-- CreateTable
CREATE TABLE `role_assignments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(120) NOT NULL,
    `role` ENUM('EMPLOYEE', 'HR', 'ADMIN') NOT NULL,
    `note` VARCHAR(255) NULL,
    `claimed_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `role_assignments_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
