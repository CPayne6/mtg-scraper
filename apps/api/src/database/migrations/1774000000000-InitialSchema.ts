import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Consolidated initial schema for ScoutLGS.
 *
 * Generated from pg_dump of the dev database after all prior migrations
 * had been applied. Replaces the chain of 11 incremental migrations from
 * the pre-deployment exploration phase.
 *
 * Schema includes: stores, MTG card data (names, sets, printings, listings,
 * variants), tokens, product URLs, discovery runs, shopify_products lookup,
 * card lists, and supporting indexes.
 */
export class InitialSchema1774000000000 implements MigrationInterface {
  name = 'InitialSchema1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public`);
    await queryRunner.query(`CREATE TABLE public.card_conditions (
    id smallint NOT NULL,
    code character varying(10) NOT NULL,
    display_name character varying(50) NOT NULL,
    sort_order smallint NOT NULL
)`);
    await queryRunner.query(`CREATE SEQUENCE public.card_conditions_id_seq
    AS smallint
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1`);
    await queryRunner.query(`ALTER SEQUENCE public.card_conditions_id_seq OWNED BY public.card_conditions.id`);
    await queryRunner.query(`CREATE TABLE public.card_list_entries (
    id integer NOT NULL,
    card_list_id integer NOT NULL,
    card_name_id integer NOT NULL,
    "position" smallint NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
)`);
    await queryRunner.query(`CREATE SEQUENCE public.card_list_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1`);
    await queryRunner.query(`ALTER SEQUENCE public.card_list_entries_id_seq OWNED BY public.card_list_entries.id`);
    await queryRunner.query(`CREATE TABLE public.card_listings (
    id integer NOT NULL,
    card_name_id integer,
    card_printing_id integer,
    store_id integer NOT NULL,
    product_url_id integer NOT NULL,
    raw_title character varying(500),
    currency character varying(3) DEFAULT 'CAD'::character varying NOT NULL,
    image_url text,
    price_updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
)`);
    await queryRunner.query(`CREATE SEQUENCE public.card_listings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1`);
    await queryRunner.query(`ALTER SEQUENCE public.card_listings_id_seq OWNED BY public.card_listings.id`);
    await queryRunner.query(`CREATE TABLE public.card_lists (
    id integer NOT NULL,
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_cookie uuid NOT NULL,
    name character varying(100) NOT NULL,
    filter_stores text,
    filter_conditions text,
    filter_set_code character varying(10),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone DEFAULT (now() + '30 days'::interval) NOT NULL
)`);
    await queryRunner.query(`CREATE SEQUENCE public.card_lists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1`);
    await queryRunner.query(`ALTER SEQUENCE public.card_lists_id_seq OWNED BY public.card_lists.id`);
    await queryRunner.query(`CREATE TABLE public.card_names (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    normalized_name character varying(255) NOT NULL,
    oracle_id uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
)`);
    await queryRunner.query(`CREATE SEQUENCE public.card_names_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1`);
    await queryRunner.query(`ALTER SEQUENCE public.card_names_id_seq OWNED BY public.card_names.id`);
    await queryRunner.query(`CREATE TABLE public.card_printings (
    id integer NOT NULL,
    card_name_id integer NOT NULL,
    scryfall_id uuid NOT NULL,
    set_id integer NOT NULL,
    collector_number character varying(10) NOT NULL,
    rarity character varying(50),
    image_uri text,
    layout text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
)`);
    await queryRunner.query(`CREATE SEQUENCE public.card_printings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1`);
    await queryRunner.query(`ALTER SEQUENCE public.card_printings_id_seq OWNED BY public.card_printings.id`);
    await queryRunner.query(`CREATE TABLE public.card_variants (
    id integer NOT NULL,
    card_listing_id integer NOT NULL,
    condition_id smallint NOT NULL,
    price numeric(10,2) NOT NULL,
    quantity integer,
    platform_variant_id character varying(20),
    sku character varying(100),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    price_updated_at timestamp without time zone DEFAULT now() NOT NULL,
    foil boolean DEFAULT false NOT NULL
)`);
    await queryRunner.query(`CREATE SEQUENCE public.card_variants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1`);
    await queryRunner.query(`ALTER SEQUENCE public.card_variants_id_seq OWNED BY public.card_variants.id`);
    await queryRunner.query(`CREATE TABLE public.extraction_runs (
    id integer NOT NULL,
    status character varying(20) DEFAULT 'running'::character varying NOT NULL,
    trigger character varying(20) DEFAULT 'cron'::character varying NOT NULL,
    skip_extraction boolean DEFAULT false NOT NULL,
    stores_total integer DEFAULT 0 NOT NULL,
    extractions_succeeded integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone
)`);
    await queryRunner.query(`CREATE SEQUENCE public.extraction_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1`);
    await queryRunner.query(`ALTER SEQUENCE public.extraction_runs_id_seq OWNED BY public.extraction_runs.id`);
    await queryRunner.query(`CREATE TABLE public.product_urls (
    id integer NOT NULL,
    store_id integer NOT NULL,
    handle character varying(255) NOT NULL,
    sitemap_lastmod timestamp without time zone,
    discovered_at timestamp without time zone DEFAULT now() NOT NULL,
    last_extracted_at timestamp without time zone,
    extraction_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    extraction_error text,
    variants_total integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
)`);
    await queryRunner.query(`CREATE SEQUENCE public.product_urls_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1`);
    await queryRunner.query(`ALTER SEQUENCE public.product_urls_id_seq OWNED BY public.product_urls.id`);
    await queryRunner.query(`CREATE TABLE public.sets (
    id integer NOT NULL,
    code character varying(10) NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
)`);
    await queryRunner.query(`CREATE SEQUENCE public.sets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1`);
    await queryRunner.query(`ALTER SEQUENCE public.sets_id_seq OWNED BY public.sets.id`);
    await queryRunner.query(`CREATE TABLE public.shopify_products (
    shopify_product_id bigint NOT NULL,
    store_id integer NOT NULL,
    product_url_id integer,
    card_listing_id integer,
    is_token boolean DEFAULT false NOT NULL,
    match_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
)`);
    // stores: tolerate pre-existing table from an early synchronize:true bootstrap.
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.stores (
    id integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying NOT NULL,
    display_name character varying NOT NULL,
    base_url character varying NOT NULL,
    logo_url character varying,
    is_active boolean DEFAULT true NOT NULL,
    scraper_type character varying NOT NULL,
    scraper_config jsonb,
    platform_type character varying(50),
    discovery_config jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    rate_limit_per_second integer DEFAULT 15 NOT NULL
)`);
    await queryRunner.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS platform_type character varying(50)`);
    await queryRunner.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS discovery_config jsonb`);
    await queryRunner.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS rate_limit_per_second integer NOT NULL DEFAULT 15`);
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS public.stores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1`);
    await queryRunner.query(`ALTER SEQUENCE public.stores_id_seq OWNED BY public.stores.id`);
    await queryRunner.query(`CREATE TABLE public.token_listings (
    id integer NOT NULL,
    token_name_id integer,
    token_printing_id integer,
    store_id integer NOT NULL,
    product_url_id integer NOT NULL,
    raw_title character varying(500),
    image_url text,
    currency character varying(3) DEFAULT 'CAD'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    price_updated_at timestamp without time zone DEFAULT now() NOT NULL
)`);
    await queryRunner.query(`CREATE SEQUENCE public.token_listings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1`);
    await queryRunner.query(`ALTER SEQUENCE public.token_listings_id_seq OWNED BY public.token_listings.id`);
    await queryRunner.query(`CREATE TABLE public.token_names (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    normalized_name character varying(255) NOT NULL,
    oracle_id uuid NOT NULL,
    layout character varying(30),
    type_line text,
    supertype character varying(100),
    card_type character varying(100),
    subtypes character varying(255),
    power character varying(10),
    toughness character varying(10),
    colors character varying(20),
    oracle_text text,
    keywords text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
)`);
    await queryRunner.query(`CREATE SEQUENCE public.token_names_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1`);
    await queryRunner.query(`ALTER SEQUENCE public.token_names_id_seq OWNED BY public.token_names.id`);
    await queryRunner.query(`CREATE TABLE public.token_printings (
    id integer NOT NULL,
    token_name_id integer NOT NULL,
    scryfall_id uuid NOT NULL,
    set_id integer NOT NULL,
    collector_number character varying(10) NOT NULL,
    rarity character varying(50),
    image_uri text,
    layout text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
)`);
    await queryRunner.query(`CREATE SEQUENCE public.token_printings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1`);
    await queryRunner.query(`ALTER SEQUENCE public.token_printings_id_seq OWNED BY public.token_printings.id`);
    await queryRunner.query(`CREATE TABLE public.token_variants (
    id integer NOT NULL,
    token_listing_id integer NOT NULL,
    condition_id smallint NOT NULL,
    foil boolean DEFAULT false NOT NULL,
    price numeric(10,2) NOT NULL,
    quantity integer,
    platform_variant_id character varying(20),
    sku character varying(100),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    price_updated_at timestamp without time zone DEFAULT now() NOT NULL
)`);
    await queryRunner.query(`CREATE SEQUENCE public.token_variants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1`);
    await queryRunner.query(`ALTER SEQUENCE public.token_variants_id_seq OWNED BY public.token_variants.id`);
    await queryRunner.query(`CREATE TABLE public.unmatched_cards (
    id integer NOT NULL,
    store_id integer NOT NULL,
    product_url_id integer NOT NULL,
    raw_name character varying(500) NOT NULL,
    normalized_name character varying(500) NOT NULL,
    set_name character varying(255),
    set_code character varying(10),
    collector_number character varying(10),
    condition character varying(20) NOT NULL,
    foil boolean DEFAULT false NOT NULL,
    price numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'CAD'::character varying NOT NULL,
    in_stock boolean DEFAULT true NOT NULL,
    quantity integer,
    image_url text,
    product_link text NOT NULL,
    sku character varying(100),
    platform_variant_id character varying(100),
    retry_count integer DEFAULT 0 NOT NULL,
    last_retry_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
)`);
    await queryRunner.query(`CREATE SEQUENCE public.unmatched_cards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1`);
    await queryRunner.query(`ALTER SEQUENCE public.unmatched_cards_id_seq OWNED BY public.unmatched_cards.id`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_conditions ALTER COLUMN id SET DEFAULT nextval('public.card_conditions_id_seq'::regclass)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_list_entries ALTER COLUMN id SET DEFAULT nextval('public.card_list_entries_id_seq'::regclass)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_listings ALTER COLUMN id SET DEFAULT nextval('public.card_listings_id_seq'::regclass)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_lists ALTER COLUMN id SET DEFAULT nextval('public.card_lists_id_seq'::regclass)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_names ALTER COLUMN id SET DEFAULT nextval('public.card_names_id_seq'::regclass)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_printings ALTER COLUMN id SET DEFAULT nextval('public.card_printings_id_seq'::regclass)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_variants ALTER COLUMN id SET DEFAULT nextval('public.card_variants_id_seq'::regclass)`);
    await queryRunner.query(`ALTER TABLE ONLY public.extraction_runs ALTER COLUMN id SET DEFAULT nextval('public.extraction_runs_id_seq'::regclass)`);
    await queryRunner.query(`ALTER TABLE ONLY public.product_urls ALTER COLUMN id SET DEFAULT nextval('public.product_urls_id_seq'::regclass)`);
    await queryRunner.query(`ALTER TABLE ONLY public.sets ALTER COLUMN id SET DEFAULT nextval('public.sets_id_seq'::regclass)`);
    await queryRunner.query(`ALTER TABLE ONLY public.stores ALTER COLUMN id SET DEFAULT nextval('public.stores_id_seq'::regclass)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_listings ALTER COLUMN id SET DEFAULT nextval('public.token_listings_id_seq'::regclass)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_names ALTER COLUMN id SET DEFAULT nextval('public.token_names_id_seq'::regclass)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_printings ALTER COLUMN id SET DEFAULT nextval('public.token_printings_id_seq'::regclass)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_variants ALTER COLUMN id SET DEFAULT nextval('public.token_variants_id_seq'::regclass)`);
    await queryRunner.query(`ALTER TABLE ONLY public.unmatched_cards ALTER COLUMN id SET DEFAULT nextval('public.unmatched_cards_id_seq'::regclass)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_listings
    ADD CONSTRAINT "PK_card_listings" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_names
    ADD CONSTRAINT "PK_card_names" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_printings
    ADD CONSTRAINT "PK_card_printings" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.product_urls
    ADD CONSTRAINT "PK_product_urls" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.sets
    ADD CONSTRAINT "PK_sets" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.shopify_products
    ADD CONSTRAINT "PK_shopify_products" PRIMARY KEY (shopify_product_id)`);
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'stores' AND constraint_type = 'PRIMARY KEY'
      ) THEN
        ALTER TABLE public.stores ADD CONSTRAINT "PK_stores" PRIMARY KEY (id);
      END IF;
    END $$`);
    await queryRunner.query(`ALTER TABLE ONLY public.unmatched_cards
    ADD CONSTRAINT "PK_unmatched_cards" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_names
    ADD CONSTRAINT "UQ_card_names_normalized" UNIQUE (normalized_name)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_names
    ADD CONSTRAINT "UQ_card_names_oracle_id" UNIQUE (oracle_id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.sets
    ADD CONSTRAINT "UQ_sets_code" UNIQUE (code)`);
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_schema = 'public' AND tc.table_name = 'stores'
          AND tc.constraint_type = 'UNIQUE' AND ccu.column_name = 'name'
      ) THEN
        ALTER TABLE public.stores ADD CONSTRAINT "UQ_stores_name" UNIQUE (name);
      END IF;
    END $$`);
    await queryRunner.query(`ALTER TABLE ONLY public.unmatched_cards
    ADD CONSTRAINT "UQ_unmatched_cards_store_product_raw" UNIQUE (store_id, product_url_id, raw_name)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_conditions
    ADD CONSTRAINT card_conditions_code_key UNIQUE (code)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_conditions
    ADD CONSTRAINT card_conditions_pkey PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_list_entries
    ADD CONSTRAINT card_list_entries_pkey PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_lists
    ADD CONSTRAINT card_lists_pkey PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_variants
    ADD CONSTRAINT card_variants_pkey PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.extraction_runs
    ADD CONSTRAINT extraction_runs_pkey PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_listings
    ADD CONSTRAINT token_listings_pkey PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_names
    ADD CONSTRAINT token_names_oracle_id_key UNIQUE (oracle_id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_names
    ADD CONSTRAINT token_names_pkey PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_printings
    ADD CONSTRAINT token_printings_pkey PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_printings
    ADD CONSTRAINT token_printings_scryfall_id_key UNIQUE (scryfall_id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_variants
    ADD CONSTRAINT token_variants_pkey PRIMARY KEY (id)`);
    await queryRunner.query(`CREATE INDEX "IDX_card_list_entries_card_name" ON public.card_list_entries USING btree (card_name_id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_card_list_entries_list_position" ON public.card_list_entries USING btree (card_list_id, "position")`);
    await queryRunner.query(`CREATE INDEX "IDX_card_lists_expires_at" ON public.card_lists USING btree (expires_at)`);
    await queryRunner.query(`CREATE INDEX "IDX_card_lists_owner_cookie" ON public.card_lists USING btree (owner_cookie)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_card_lists_uuid" ON public.card_lists USING btree (uuid)`);
    await queryRunner.query(`CREATE INDEX "IDX_extraction_runs_started_at" ON public.extraction_runs USING btree (started_at DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_extraction_runs_status" ON public.extraction_runs USING btree (status)`);
    await queryRunner.query(`CREATE INDEX idx_card_listings_card_name ON public.card_listings USING btree (card_name_id)`);
    await queryRunner.query(`CREATE INDEX idx_card_listings_store_card_name ON public.card_listings USING btree (store_id, card_name_id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_card_listings_store_product_url ON public.card_listings USING btree (store_id, product_url_id)`);
    await queryRunner.query(`CREATE INDEX idx_card_names_name_trgm ON public.card_names USING gin (name public.gin_trgm_ops)`);
    await queryRunner.query(`CREATE INDEX idx_card_names_normalized ON public.card_names USING btree (normalized_name)`);
    await queryRunner.query(`CREATE INDEX idx_card_names_normalized_name_trgm ON public.card_names USING gin (normalized_name public.gin_trgm_ops)`);
    await queryRunner.query(`CREATE INDEX idx_card_printings_card_name_id ON public.card_printings USING btree (card_name_id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_card_printings_scryfall_id ON public.card_printings USING btree (scryfall_id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_card_printings_set_collector ON public.card_printings USING btree (set_id, collector_number)`);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_card_variants_listing_condition_foil ON public.card_variants USING btree (card_listing_id, condition_id, foil)`);
    await queryRunner.query(`CREATE INDEX idx_card_variants_listing_price ON public.card_variants USING btree (card_listing_id, price)`);
    await queryRunner.query(`CREATE INDEX idx_card_variants_platform_variant ON public.card_variants USING btree (platform_variant_id)`);
    await queryRunner.query(`CREATE INDEX idx_product_urls_extraction ON public.product_urls USING btree (extraction_status, last_extracted_at)`);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_product_urls_store_handle ON public.product_urls USING btree (store_id, handle)`);
    await queryRunner.query(`CREATE INDEX idx_product_urls_store_status ON public.product_urls USING btree (store_id, extraction_status)`);
    await queryRunner.query(`CREATE INDEX idx_shopify_products_match_status ON public.shopify_products USING btree (match_status)`);
    await queryRunner.query(`CREATE INDEX idx_shopify_products_product_url ON public.shopify_products USING btree (product_url_id)`);
    await queryRunner.query(`CREATE INDEX idx_shopify_products_store ON public.shopify_products USING btree (store_id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_token_listings_store_product_url ON public.token_listings USING btree (store_id, product_url_id)`);
    await queryRunner.query(`CREATE INDEX idx_token_listings_store_token_name ON public.token_listings USING btree (store_id, token_name_id)`);
    await queryRunner.query(`CREATE INDEX idx_token_listings_token_name ON public.token_listings USING btree (token_name_id)`);
    await queryRunner.query(`CREATE INDEX idx_token_names_card_type ON public.token_names USING btree (card_type)`);
    await queryRunner.query(`CREATE INDEX idx_token_names_normalized ON public.token_names USING btree (normalized_name)`);
    await queryRunner.query(`CREATE INDEX idx_token_names_normalized_trgm ON public.token_names USING gin (normalized_name public.gin_trgm_ops)`);
    await queryRunner.query(`CREATE INDEX idx_token_names_subtypes ON public.token_names USING btree (subtypes)`);
    await queryRunner.query(`CREATE INDEX idx_token_printings_scryfall_id ON public.token_printings USING btree (scryfall_id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_token_printings_set_collector ON public.token_printings USING btree (set_id, collector_number)`);
    await queryRunner.query(`CREATE INDEX idx_token_printings_token_name_id ON public.token_printings USING btree (token_name_id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_token_variants_listing_condition_foil ON public.token_variants USING btree (token_listing_id, condition_id, foil)`);
    await queryRunner.query(`CREATE INDEX idx_token_variants_platform_variant ON public.token_variants USING btree (platform_variant_id)`);
    await queryRunner.query(`CREATE INDEX idx_unmatched_cards_created_at ON public.unmatched_cards USING btree (created_at)`);
    await queryRunner.query(`CREATE INDEX idx_unmatched_cards_normalized_name ON public.unmatched_cards USING btree (normalized_name)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_listings
    ADD CONSTRAINT "FK_card_listings_card_name" FOREIGN KEY (card_name_id) REFERENCES public.card_names(id) ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_listings
    ADD CONSTRAINT "FK_card_listings_card_printing" FOREIGN KEY (card_printing_id) REFERENCES public.card_printings(id) ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_listings
    ADD CONSTRAINT "FK_card_listings_product_url_id" FOREIGN KEY (product_url_id) REFERENCES public.product_urls(id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_listings
    ADD CONSTRAINT "FK_card_listings_store" FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_printings
    ADD CONSTRAINT "FK_card_printings_card_name" FOREIGN KEY (card_name_id) REFERENCES public.card_names(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_printings
    ADD CONSTRAINT "FK_card_printings_set" FOREIGN KEY (set_id) REFERENCES public.sets(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_variants
    ADD CONSTRAINT "FK_card_variants_card_listing_id" FOREIGN KEY (card_listing_id) REFERENCES public.card_listings(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_variants
    ADD CONSTRAINT "FK_card_variants_condition" FOREIGN KEY (condition_id) REFERENCES public.card_conditions(id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.product_urls
    ADD CONSTRAINT "FK_product_urls_store" FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.shopify_products
    ADD CONSTRAINT "FK_shopify_products_card_listing" FOREIGN KEY (card_listing_id) REFERENCES public.card_listings(id) ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE ONLY public.shopify_products
    ADD CONSTRAINT "FK_shopify_products_product_url" FOREIGN KEY (product_url_id) REFERENCES public.product_urls(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.shopify_products
    ADD CONSTRAINT "FK_shopify_products_store" FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.unmatched_cards
    ADD CONSTRAINT "FK_unmatched_cards_product_url_id" FOREIGN KEY (product_url_id) REFERENCES public.product_urls(id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.unmatched_cards
    ADD CONSTRAINT "FK_unmatched_cards_store" FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_list_entries
    ADD CONSTRAINT card_list_entries_card_list_id_fkey FOREIGN KEY (card_list_id) REFERENCES public.card_lists(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.card_list_entries
    ADD CONSTRAINT card_list_entries_card_name_id_fkey FOREIGN KEY (card_name_id) REFERENCES public.card_names(id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_listings
    ADD CONSTRAINT token_listings_product_url_id_fkey FOREIGN KEY (product_url_id) REFERENCES public.product_urls(id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_listings
    ADD CONSTRAINT token_listings_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_listings
    ADD CONSTRAINT token_listings_token_name_id_fkey FOREIGN KEY (token_name_id) REFERENCES public.token_names(id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_listings
    ADD CONSTRAINT token_listings_token_printing_id_fkey FOREIGN KEY (token_printing_id) REFERENCES public.token_printings(id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_printings
    ADD CONSTRAINT token_printings_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.sets(id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_printings
    ADD CONSTRAINT token_printings_token_name_id_fkey FOREIGN KEY (token_name_id) REFERENCES public.token_names(id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_variants
    ADD CONSTRAINT token_variants_condition_id_fkey FOREIGN KEY (condition_id) REFERENCES public.card_conditions(id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.token_variants
    ADD CONSTRAINT token_variants_token_listing_id_fkey FOREIGN KEY (token_listing_id) REFERENCES public.token_listings(id) ON DELETE CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SEQUENCE IF EXISTS public.unmatched_cards_id_seq CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.unmatched_cards CASCADE`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS public.token_variants_id_seq CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.token_variants CASCADE`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS public.token_printings_id_seq CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.token_printings CASCADE`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS public.token_names_id_seq CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.token_names CASCADE`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS public.token_listings_id_seq CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.token_listings CASCADE`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS public.stores_id_seq CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.stores CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.shopify_products CASCADE`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS public.sets_id_seq CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.sets CASCADE`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS public.product_urls_id_seq CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.product_urls CASCADE`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS public.extraction_runs_id_seq CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.extraction_runs CASCADE`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS public.card_variants_id_seq CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.card_variants CASCADE`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS public.card_printings_id_seq CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.card_printings CASCADE`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS public.card_names_id_seq CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.card_names CASCADE`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS public.card_lists_id_seq CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.card_lists CASCADE`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS public.card_listings_id_seq CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.card_listings CASCADE`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS public.card_list_entries_id_seq CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.card_list_entries CASCADE`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS public.card_conditions_id_seq CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.card_conditions CASCADE`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "pg_trgm"`);
  }
}
