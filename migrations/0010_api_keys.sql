-- Keys for external systems calling the /api/v1 endpoints. Only a SHA-256 hash of each key is
-- stored; the full key is shown once when it's created. key_prefix is the start of the key, so
-- admins can tell keys apart.
CREATE TABLE `api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`key_prefix` varchar(16) NOT NULL,
	`key_hash` char(64) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`expires_at` date NULL,
	`last_used_at` datetime NULL,
	`last_used_ip` varchar(64) NULL,
	`notes` text NULL,
	`created_by_id` int NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_keys_hash_unique` UNIQUE(`key_hash`),
	CONSTRAINT `api_keys_created_by_fk` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

-- What each key may do, per feature. A feature with no row means no access.
CREATE TABLE `api_key_permissions` (
	`api_key_id` int NOT NULL,
	`feature` varchar(40) NOT NULL,
	`access_level` enum('READ','WRITE') NOT NULL,
	CONSTRAINT `api_key_permissions_pk` PRIMARY KEY(`api_key_id`, `feature`),
	CONSTRAINT `api_key_permissions_key_fk` FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON DELETE CASCADE
);
