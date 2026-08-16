# Product TODOs

- [x] Add a sold-out check when selecting cards from a store so users do not reach checkout with items that are already unavailable.
- [x] Allow users to select "ignore basic lands" during list creation.
- [x] Update the fill-in-best-cards flow so it starts from the cards already in the user's cart, uses that as the baseline for the best-card calculation, and does not add duplicate cards to the cart when they are already present there.
- [x] Update the home-screen messaging to state that the service currently covers Toronto only, with additional locations coming soon.
- [x] Investigate and implement pagination where needed.
- [x] Format shipping prices as currency, including a dollar sign and two decimal places (for example, `$5.00`).
- [ ] Add collection-list support so users can upload cards they already own and avoid purchasing duplicates.
  - Research currently available collection/deck-tracking services and their supported collection-export formats before selecting an import approach.
  - Support importing collections from Archidekt and ManaBox, plus other widely used services identified by the research.
  - Use the v1 library implementation as the design reference: it accepts ManaBox CSV/TXT uploads, stores the collection in browser local storage, and marks matching cards as already in the library.
  - In v2, make owned-card status clear and exclude or prevent owned cards from being added to a purchase/checkout flow.
- [ ] Before checkout, perform a live merchant-stock validation for every card.
  - If any card is unavailable, prevent checkout and update the database to reflect its out-of-stock status.
  - Current cart validation only checks our database's `inStock` status; it does not recheck the merchant immediately before checkout.
- [x] Replace the cards-list long view with an expandable accordion.
