-- MySQL schema reference for SpiderNET (se_detection).
-- For documentation only: the real database is expected to already exist.

CREATE TABLE IF NOT EXISTS messages (
  id             VARCHAR(36)  PRIMARY KEY,
  vector_type    VARCHAR(10)  NOT NULL,
  sender         VARCHAR(255) NOT NULL,
  sender_domain  VARCHAR(255),
  recipient      VARCHAR(255) NOT NULL,
  raw_content    TEXT         NOT NULL,
  subject        VARCHAR(500),
  received_at    DATETIME     NOT NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'pending',
  INDEX idx_messages_received_at (received_at),
  INDEX idx_messages_vector_type (vector_type),
  INDEX idx_messages_status (status)
);

CREATE TABLE IF NOT EXISTS message_features (
  id             VARCHAR(36)  PRIMARY KEY,
  vector_type    VARCHAR(10)  NOT NULL,
  sender         VARCHAR(255) NOT NULL,
  sender_domain  VARCHAR(255),
  recipient      VARCHAR(255) NOT NULL,
  raw_content    TEXT,
  subject        VARCHAR(500),
  received_at    DATETIME,
  status         VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS correlation_groups (
  id             VARCHAR(36)  PRIMARY KEY,
  message_ids    JSON         NOT NULL,
  entity_key     VARCHAR(255) NOT NULL,
  vector_types   JSON         NOT NULL,
  s1_score       FLOAT,
  s2_score       FLOAT,
  s3_score       FLOAT,
  s4_score       FLOAT,
  c_score        FLOAT,
  severity       VARCHAR(20),
  campaign_type  VARCHAR(50),
  actor_id       VARCHAR(36),
  campaign_id    VARCHAR(36),
  created_at     DATETIME     NOT NULL,
  updated_at     DATETIME     NOT NULL,
  INDEX idx_groups_entity_key (entity_key),
  INDEX idx_groups_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS alerts (
  id             VARCHAR(36)  PRIMARY KEY,
  group_id       VARCHAR(36)  NOT NULL,
  c_score        FLOAT,
  severity       VARCHAR(20),
  campaign_type  VARCHAR(50),
  victims        JSON,
  status         VARCHAR(20)  NOT NULL DEFAULT 'active',
  created_at     DATETIME     NOT NULL,
  resolved_at    DATETIME,
  INDEX idx_alerts_created_at (created_at),
  INDEX idx_alerts_severity (severity),
  CONSTRAINT fk_alerts_group FOREIGN KEY (group_id)
    REFERENCES correlation_groups(id)
);

CREATE TABLE IF NOT EXISTS rules_hits (
  id             INT           PRIMARY KEY AUTO_INCREMENT,
  group_id       VARCHAR(36)   NOT NULL,
  rule_name      VARCHAR(100)  NOT NULL,
  rule_score     FLOAT,
  vector_types   JSON,
  created_at     DATETIME      NOT NULL,
  INDEX idx_rules_hits_group (group_id),
  CONSTRAINT fk_rules_group FOREIGN KEY (group_id)
    REFERENCES correlation_groups(id)
);

CREATE TABLE IF NOT EXISTS known_bad_senders (
  id             INT           PRIMARY KEY AUTO_INCREMENT,
  sender_value   VARCHAR(255)  NOT NULL,
  sender_type    VARCHAR(20)   NOT NULL,
  threat_score   FLOAT,
  source         VARCHAR(100),
  first_seen     DATETIME,
  last_seen      DATETIME,
  hit_count      INT           NOT NULL DEFAULT 0,
  INDEX idx_kbs_sender_value (sender_value)
);
