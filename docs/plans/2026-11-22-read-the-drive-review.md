# Drive reader design review

A fresh-context independent Codex reviewer read revision 1 at 63c2ed2, the accepted design brief, the replay page, replay and full-snap projections, shared field and snap types. A preliminary external run produced no review. The completed independent review identified three concrete changes.

- Preserve player placement through reveal. The old special-case action projection preferred the target for an outside slot. Use an independently verified starting alignment keyed to player identity, shared by both phases. Test every verified player’s slot and invariance to a changed result.
- Preserve missing information in both the new reader and historical throws. A missing side had selected a middle lane in the action projection. Keep the available depth and participant in the account and require a recorded direction to place a lateral endpoint.
- Resolve a tracked identity only from the visible boundary and its past. Rewinding before the player’s first verified appearance must not introduce their name, including in URL-derived display text or serialized client props. Native and browser-history tests cover selection with and without a confirmed current lineup.

The previously approved phone interaction supplies the concept proof. The published reader should use its score boundary, field, player picker and reveal order across the Cleveland series; the ordinary archive entry also handles changed field position, kicks, rulings and missing charting.
