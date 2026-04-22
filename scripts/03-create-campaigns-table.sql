-- Migration: Create campaigns table for campaign resolution
-- Run with: mysql -u root -pmysql123456789 se_detection < scripts/03-create-campaigns-table.sql

CREATE TABLE IF NOT EXISTS campaigns (
  id VARCHAR(36) PRIMARY KEY,
  campaign_type VARCHAR(100) NOT NULL,
  window_start DATE NOT NULL,
  window_end DATE NOT NULL,
  group_count INT NOT NULL DEFAULT 0,
  total_message_count INT NOT NULL DEFAULT 0,
  severity_max ENUM('DISMISSED','LOW','MEDIUM','HIGH','CRITICAL') NULL,
  first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_camp (campaign_type, window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;