-- Apply legacy MySQL net DB changes and remove deprecated DB functions.
-- Usage:
--   mysql -h <host> -P <port> -u <user> -p <database> < sql/apply-net-migration.sql

START TRANSACTION;

CREATE TABLE IF NOT EXISTS `SchemaMigration` (
  `id` VARCHAR(255) NOT NULL,
  `appliedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

COMMIT;

DROP PROCEDURE IF EXISTS `drop_unique_if_exists`;
DELIMITER $$
CREATE PROCEDURE `drop_unique_if_exists`(IN p_table_name VARCHAR(128), IN p_constraint_name VARCHAR(128))
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
      AND CONSTRAINT_NAME = p_constraint_name
      AND CONSTRAINT_TYPE = 'UNIQUE'
  ) THEN
    SET @sql = CONCAT(
      'ALTER TABLE `',
      REPLACE(p_table_name, '`', '``'),
      '` DROP INDEX `',
      REPLACE(p_constraint_name, '`', '``'),
      '`'
    );
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL `drop_unique_if_exists`('cover_individual', 'cover_individual_fk_individual_fk_cover_unique');
CALL `drop_unique_if_exists`('feature_individual', 'feature_individual_fk_individual_fk_feature_unique');
CALL `drop_unique_if_exists`('issue_individual', 'issue_individual_fk_issue_fk_individual_unique');
CALL `drop_unique_if_exists`('story_individual', 'story_individual_fk_story_fk_individual_unique');
CALL `drop_unique_if_exists`('story_appearance', 'story_appearance_fk_story_fk_appearance_unique');

CALL `drop_unique_if_exists`('Cover_Individual', 'Cover_Individual_fk_individual_fk_cover_unique');
CALL `drop_unique_if_exists`('Feature_Individual', 'Feature_Individual_fk_individual_fk_feature_unique');
CALL `drop_unique_if_exists`('Issue_Individual', 'Issue_Individual_fk_issue_fk_individual_unique');
CALL `drop_unique_if_exists`('Story_Individual', 'Story_Individual_fk_story_fk_individual_unique');
CALL `drop_unique_if_exists`('Story_Appearance', 'Story_Appearance_fk_story_fk_appearance_unique');

DROP PROCEDURE IF EXISTS `drop_unique_if_exists`;

DROP FUNCTION IF EXISTS `toroman`;
DROP FUNCTION IF EXISTS `fromroman`;
DROP FUNCTION IF EXISTS `urlencode`;
DROP FUNCTION IF EXISTS `createserieslabel`;
DROP FUNCTION IF EXISTS `createissuelabel`;
DROP FUNCTION IF EXISTS `createlabel`;
DROP FUNCTION IF EXISTS `createurl`;
DROP FUNCTION IF EXISTS `sortabletitle`;

-- SQL function logic has been moved to TypeScript utilities in `src/util/dbFunctions.ts`.

INSERT INTO `SchemaMigration` (`id`, `appliedAt`)
VALUES
  ('202602130001_create_user_session_table', NOW()),
  ('202602130002_drop_legacy_unique_constraints', NOW()),
  ('202602130004_create_login_attempt_table', NOW()),
  ('202602130005_add_csrf_token_hash_to_user_session', NOW()),
  ('202602130006_drop_user_session_table', NOW()),
  ('202602130007_drop_login_attempt_table', NOW()),
  ('202602160001_drop_legacy_database_functions', NOW())
ON DUPLICATE KEY UPDATE `id` = VALUES(`id`);
