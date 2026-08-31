-- Dedicated PostgreSQL database for append-only listing price history.
-- The application writes only baseline and material price/stock changes via
-- its transaction outbox; current inventory remains in the primary database.
CREATE TABLE IF NOT EXISTS price_history (
  observed_month date NOT NULL,
  listing_id bigint NOT NULL,
  oracle_id uuid,
  store_id integer NOT NULL,
  variant_id bigint NOT NULL,
  observed_at timestamptz NOT NULL,
  price numeric(12,2) NOT NULL,
  currency varchar(3) NOT NULL,
  in_stock boolean NOT NULL,
  quantity integer,
  event_type varchar(20) NOT NULL,
  PRIMARY KEY (observed_month, listing_id, variant_id, observed_at)
) PARTITION BY RANGE (observed_month);

CREATE INDEX IF NOT EXISTS price_history_listing_observed_idx
  ON price_history (listing_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS price_history_oracle_observed_idx
  ON price_history (oracle_id, observed_at DESC);

-- Create the current month partition during provisioning. The history writer
-- creates following monthly partitions ahead of the month boundary.
CREATE TABLE IF NOT EXISTS price_history_default
  PARTITION OF price_history DEFAULT;
