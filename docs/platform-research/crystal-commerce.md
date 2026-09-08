# CrystalCommerce decision — implement with credentials

Decision date: 2026-09-08.

CrystalCommerce publishes a REST API client and endpoint definitions. Its
catalog endpoints are `GET https://api.crystalcommerce.com/v1/catalog/products?page=N`,
`/catalog/categories`, and `/catalog/stores`; per-merchant inventory is
`GET /v1/stores/{store}/products?page=N`. The latter is the relevant contract:
the generic catalog does not contain merchant price or quantity. The vendor's
published client sends HTTP Basic credentials (license login/key) for every
request. ScoutLGS therefore accepts a secret *reference*, never a credential in
`scraper_config` or the admin form.

The published client uses numbered `page` pagination; its response targets
`paginated_collection.entries`. No public rate-limit policy was found, so the
adapter honours the store's configured rate and treats 429/5xx as retryable.
The client documents product id/name/seoname, category id/name and image URLs,
and its store product payload is the price/quantity source. Options/SKUs are
available in the per-store variant model, but exact descriptors are merchant
catalogue dependent. Product URL is based on the returned URL or seoname.

Magic singles can only be safely constrained by a merchant-provided category
or query and a successful matching sample; `all-products` is permitted for a
probe but must not be scheduled until its scope validates. The generic catalogue
includes many non-Magic categories, including sealed products and supplies.
Title and SKU conventions are not universal: use the existing parser profile,
prefer structured SKU set/collector/finish when present, and reject profiles
that cannot identify cards. Product images are used unless a variant image is
present.

Representative integration evidence: the vendor-maintained
[cc-cli repository](https://github.com/crystalcommerce/cc-cli) documents both
the shared catalogue and `/v1/stores/{db}/products`.

## Access and contacts

The current CrystalCommerce site invites technology partners to pitch an
integration and names `dan@crystalcommerce.com` and
`support@crystalcommerce.com` for that purpose. It also publishes support
phone `425-478-7998` and daily support calls. Their terms say API Services must
be included in the applicable order/access agreement and that API keys are
issued to the authorized party and must be kept confidential. Do not ask a
merchant to disclose an existing key; obtain CrystalCommerce-approved partner
access and merchant authorization. The legacy CLI proves a Basic Auth
login/key implementation, but CrystalCommerce must confirm the current
production authentication and any store-scoped token requirements.

Recommendation: implement a credential-required adapter only. Onboarding must
reject missing/invalid credentials, an unsuccessful first page, an invalid
Magic scope, or a sample below the identity threshold. There is no HTML fallback.
