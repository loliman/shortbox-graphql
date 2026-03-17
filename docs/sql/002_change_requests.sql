-- Change Requests storage for user-submitted issue change proposals.
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS shortbox.changerequests (
  id SERIAL PRIMARY KEY,
  fk_issue INTEGER NOT NULL REFERENCES shortbox.issue(id) ON DELETE CASCADE,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type VARCHAR(16) NOT NULL CHECK (type IN ('SERIES', 'ISSUE', 'PUBLISHER')),
  changerequest JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS changerequests_fk_issue_idx
  ON shortbox.changerequests (fk_issue);

CREATE INDEX IF NOT EXISTS changerequests_createdat_idx
  ON shortbox.changerequests (createdat);

CREATE INDEX IF NOT EXISTS changerequests_type_createdat_idx
  ON shortbox.changerequests (type, createdat);
