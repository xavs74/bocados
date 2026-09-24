-- Keeping what someone eats and weighs is health data, which needs their
-- explicit consent. When they gave it, and to which version of the policy, is
-- part of the account: the proof has to outlive the device that asked.
ALTER TABLE users ADD COLUMN consent_at TEXT;
ALTER TABLE users ADD COLUMN consent_version TEXT;
