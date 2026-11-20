# Race Engine Phase 22 — GeoJSON to Circuit Maker provenance bridge

## Delivered
- Added an explicit Circuit Maker action to load the reviewed GeoJSON import draft as the editable centerline.
- The imported centerline preserves normalized coordinates and only carries elevation values that were actually present in the source.
- Circuit geometry now allows omitted elevation measurements. Missing source elevation is no longer represented by a fabricated zero.
- The imported source provenance (provider, URL, license, attribution, retrieval time, source revision, SHA-256 hash, fidelity status, and limitations) is copied into the Circuit Maker geometry definition.
- Circuit Pool passes the current GeoJSON draft and provenance into Circuit Maker. Saving a geometry revision therefore stores source provenance in the immutable geometry snapshot as well as the circuit master record.
- Loading a GeoJSON draft clears any previously drawn track-limit boundary and resets the track-limit method to unverified; the operator must create a measured boundary separately.
- Imported data remains unverified. It does not infer sector boundaries, corner types, widths, banking, gradient, pit lane, DRS zones, or track limits.
- Added unit coverage for importing the centerline, preserving provenance, and leaving missing elevation absent.

## Database and compatibility
- No SQL migration required. The existing JSON geometry/revision payload stores the provenance and optional elevation fields.
- Existing geometry with numeric elevation remains valid; omitted elevation is now accepted.
- No Production database or Vercel environment changes.

## Release boundary
- GeoJSON import is still a draft. Real circuit official readiness still requires a polygon track-limit boundary, valid source license/provenance, and independent fidelity review.
- Circuit Maker does not automatically convert GeoJSON into race-ready segment/sector physics.
