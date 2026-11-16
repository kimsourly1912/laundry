-- One user belongs to exactly one shop (spec P2, T4). Better Auth's generated `member` table has a
-- plain index on user_id; this unique one is ours. A second membership for a user fails in the
-- database, whatever code writes it. Not in the Drizzle schema (Better Auth owns that table's
-- definition), so drizzle-kit never generates or drops it.
CREATE UNIQUE INDEX `member_user_id_unique` ON `member` (`user_id`);
