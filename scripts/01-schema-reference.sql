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
  id               VARCHAR(36)   PRIMARY KEY,
  entity_key       VARCHAR(255) NOT NULL,
  message_ids      JSON         NOT NULL,
  vector_types     JSON         NOT NULL,
  co_occurrence_score FLOAT,
  priming_bonus   FLOAT,
  window_start    DATETIME,
  window_end     DATETIME,
  status         ENUM('pending','evaluated','dismissed','alerted'),
  created_at     DATETIME     NOT NULL,
  s2_score       FLOAT,
  s3_score       FLOAT,
  s4_score       FLOAT,
  c_score        FLOAT,
  max_severity   VARCHAR(20),
  rule_hit_ids   JSON,
  actor_id       VARCHAR(36),
  campaign_id   VARCHAR(36),
  attack_type    VARCHAR(100),
  campaign_type VARCHAR(100),
  related_victims JSON,
  layer3_meta   JSON,
  layer4_meta   JSON,
  explanation  TEXT,
  INDEX idx_groups_entity_key (entity_key),
  INDEX idx_groups_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS alerts (
  id             VARCHAR(36)  PRIMARY KEY,
  group_id       VARCHAR(36)  NOT NULL,
  c_score        FLOAT,
  severity       VARCHAR(20),
  campaign_type  VARCHAR(100),
  victims        JSON,
  status         VARCHAR(20)  NOT NULL DEFAULT 'active',
  created_at    DATETIME     NOT NULL,
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
  kind           VARCHAR(20)   NOT NULL,
  value          VARCHAR(255)  NOT NULL,
  threat_score   FLOAT,
  hit_count      INT           NOT NULL DEFAULT 0,
  first_seen     DATETIME,
  last_seen      DATETIME,
  is_known_bad  BOOLEAN       NOT NULL DEFAULT FALSE,
  INDEX idx_kbs_value (value)
);
