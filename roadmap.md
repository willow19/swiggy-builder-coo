# Roadmap

## Done
- [x] MVP: auth, household profile, chat agent, pending actions, mock catalog, confirm-first
- [x] Swiggy MCP integration: OAuth flow, `swiggy_connections` table, callback route, connect UI in Household sheet, live tools in chat (read-only whitelist), live items in draft_cart
- [x] Dry run verified: consent page opens, dev redirect URI accepted, token exchange path ready

## Open — blocked externally
- [ ] Swiggy must resolve an OAuth/MCP verifier mismatch: its OAuth endpoint issues an HS256 access token, but its MCP endpoint rejects that token with "Incorrect alg in MCP JWT"
- [ ] After Swiggy resolves the mismatch: click "Run check" in the Household sheet to verify the live read, then try a chat like "khichdi and tomato soup from Swiggy"

## Next
- [ ] Revalidate live prices at confirm time (after dry run shows real payload shapes)
- [ ] Dineout server + order placement (v2, still confirm-first)
- [ ] Connect GitHub via Lovable editor → Plus menu → GitHub to push latest changes
