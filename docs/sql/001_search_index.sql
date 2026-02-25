CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE IF NOT EXISTS shortbox.search_index (
  id BIGSERIAL PRIMARY KEY,
  node_type TEXT NOT NULL CHECK (node_type IN ('publisher', 'series', 'issue')),
  source_id BIGINT NOT NULL,
  us BOOLEAN NOT NULL,

  publisher_name TEXT,
  series_title TEXT,
  series_volume INTEGER,
  series_startyear INTEGER,
  series_endyear INTEGER,
  series_key TEXT,

  issue_number TEXT,
  issue_format TEXT,
  issue_variant TEXT,
  issue_title TEXT,

  label TEXT NOT NULL,
  url TEXT NOT NULL,

  search_text TEXT NOT NULL,
  search_tsv tsvector NOT NULL DEFAULT ''::tsvector,

  UNIQUE (node_type, source_id)
);

CREATE OR REPLACE FUNCTION shortbox.search_index_set_tsv()
RETURNS trigger AS $$
BEGIN
  NEW.search_tsv := to_tsvector('simple', unaccent(COALESCE(NEW.search_text, '')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS search_index_tsv_trigger ON shortbox.search_index;
CREATE TRIGGER search_index_tsv_trigger
BEFORE INSERT OR UPDATE OF search_text
ON shortbox.search_index
FOR EACH ROW
EXECUTE FUNCTION shortbox.search_index_set_tsv();

CREATE INDEX IF NOT EXISTS idx_search_index_us_type
  ON shortbox.search_index (us, node_type);

CREATE INDEX IF NOT EXISTS idx_search_index_tsv
  ON shortbox.search_index
  USING GIN (search_tsv);

CREATE INDEX IF NOT EXISTS idx_search_index_text_trgm
  ON shortbox.search_index
  USING GIN (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_search_index_series_fields
  ON shortbox.search_index (us, series_title, series_volume, series_startyear);

CREATE INDEX IF NOT EXISTS idx_search_index_issue_number
  ON shortbox.search_index (us, issue_number);

CREATE INDEX IF NOT EXISTS idx_search_index_series_key
  ON shortbox.search_index (series_key);
