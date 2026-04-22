-- Migration: Create actors table for actor resolution
-- Run with: mysql -u root -pmysql123456789 se_detection < scripts/02-create-actors-table.sql

CREATE TABLE IF NOT EXISTS actors (
  id VARCHAR(36) PRIMARY KEY,
  entity_key VARCHAR(255) NOT NULL,
  kind ENUM('email_domain','sender','phone') NOT NULL,
  first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  group_count INT NOT NULL DEFAULT 0,
  total_message_count INT NOT NULL DEFAULT 0,
  severity_max ENUM('DISMISSED','LOW','MEDIUM','HIGH','CRITICAL') NULL,
  UNIQUE KEY uniq_entity (entity_key, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;