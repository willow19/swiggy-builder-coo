# Roadmap

## Done
- [x] MVP: auth, household profile, chat agent, pending actions, mock catalog, confirm-first
- [x] Swiggy MCP integration: OAuth flow, `swiggy_connections` table, callback route, connect UI in Household sheet, live tools in chat (read-only whitelist), live items in draft_cart
- [x] Dry run verified: consent page opens, dev redirect URI accepted, token exchange path ready

## Open — verification needed
- [ ] Publish the corrected Instamart endpoint (`/im`, replacing the undocumented `/instamart`) and run the connection check again
- [ ] If Swiggy still reports "Incorrect alg in MCP JWT", send the OAuth/MCP token-verifier mismatch to the Swiggy Builders team
- [ ] After the live read succeeds, try a chat like "khichdi and tomato soup from Swiggy"

## Next
- [ ] Revalidate live prices at confirm time (after dry run shows real payload shapes)
- [ ] Dineout server + order placement (v2, still confirm-first)
- [ ] Connect GitHub via Lovable editor → Plus menu → GitHub to push latest changes
