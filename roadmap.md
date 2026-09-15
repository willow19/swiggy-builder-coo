# Roadmap

## Done
- [x] MVP: auth, household profile, chat agent, pending actions, mock catalog, confirm-first
- [x] Swiggy MCP integration: OAuth flow, `swiggy_connections` table, callback route, connect UI in Household sheet, live tools in chat (read-only whitelist), live items in draft_cart
- [x] Dry run verified: consent page opens, dev redirect URI accepted, token exchange path ready

## Open — blocked on user
- [ ] Complete Swiggy sign-in with your own mobile number (OTP) via Household → Connect Swiggy — only you can do this
- [ ] After connecting: click "Run check" in the Household sheet to verify the live read, then try a chat like "khichdi and tomato soup from Swiggy"

## Next
- [ ] Revalidate live prices at confirm time (after dry run shows real payload shapes)
- [ ] Dineout server + order placement (v2, still confirm-first)
- [ ] Connect GitHub via Lovable editor → Plus menu → GitHub to push latest changes
