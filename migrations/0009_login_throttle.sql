-- Login rate limiting by IP address: failed attempts are counted per IP in a time window;
-- too many locks that IP out for a while. Rows are deleted on a successful sign-in.
CREATE TABLE `login_throttle` (
	`ip` varchar(64) NOT NULL,
	`failures` int NOT NULL DEFAULT 0,
	`window_started_at` datetime NOT NULL,
	`locked_until` datetime NULL,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `login_throttle_ip` PRIMARY KEY(`ip`)
);
CREATE INDEX `login_throttle_updated_idx` ON `login_throttle` (`updated_at`);
