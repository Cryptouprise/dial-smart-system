# knownopen-item6-geocoding

- status: completed
- tldr: Claim (6) TRUE: new-house geocoding is unimplemented — lat/lng come only from map taps or pre-geocoded CSV rows; no geocoding call exists.

Claim (6) from docs/dial-smart-app-map.md:142 — "New-house geocoding is unimplemented" — VERDICT: TRUE (high confidence).

Evidence (file:line):
- Schema has an inert column: 20261102234500_door_to_door_core.sql:62 `geocode_status text NOT NULL DEFAULT 'ok' CHECK (...IN ('ok','queued','failed'))` — nothing ever sets it to 'queued'/'failed'.
- "Add a house" uses the map long-press point, not the typed address: scripts.js:942-955 (`lat:ll[0], lng:ll[1]` at :951; ll from `e.latlng` at :934); address is free text (:944) and only zip/city are borrowed from the nearest house (nearZip, :938-941).
- CSV import drops rows without coordinates: scripts.js:1583 "Rows without lat/lng are skipped (geocode them first)."
- Native host copies only client-sent fields, no address->lat/lng: host.ts:695-725 (pick of PROPERTY_COLUMNS).
- Mapbox = basemap tiles only, not geocoding (scripts.js:21,699-700); Google Maps = turn-by-turn URLs (scripts.js:1101,3467).
- No geocoding API call anywhere: findstr for maps/api/geocode, reverseGeocode, geocodeAddress, GOOGLE_MAPS_API across src + api-gateway => 0 matches; repo-wide 'geocod' matches are column listings/docs only.

Severity: LOW-MEDIUM (known product gap, not a regression). lat/lng exist only from map taps or pre-geocoded CSV rows.

Validation: full reads of d2dApi.ts (344 lines), scripts.js:900-1018, host.ts:660-790, core migration:1-120; repo-wide greps for geocode + map providers; migrations 20261103* searched for geocode (0).

Not checked: live DB (emonjusymdripmkvtttc) coordinate distribution; all ~200 migrations / ~78 edge functions line-by-line; runtime exercise; git history/pre-port DoorBoss; external orchestrators (Hermes/n8n) for out-of-band geocoding.

Blockers: none.

## Artifact

**Findings**

VERDICT: TRUE. New-house (hand-added) geocoding is unimplemented in the dial-smart-system repo. There is NO address-to-coordinate geocoding anywhere: no geocoding API call (Google Geocoding / Nominatim reverse / Mapbox geocoding / MapLibre geocoder), no edge function, no migration logic. (1) The schema carries a geocode_status column that defaults to 'ok' and is never advanced to 'queued'/'failed' by any worker: 20261102234500_door_to_door_core.sql:62 `geocode_status text NOT NULL DEFAULT 'ok' CHECK (geocode_status IN ('ok','queued','failed'))`. (2) The 'Add a house' dialog never geocodes the typed address; the pin comes from where the rep long-pressed the map: scripts.js:942-955 openAddHouse(ll) writes `lat:ll[0], lng:ll[1]` (line 951) and ll originates from `e.latlng` (scripts.js:934 `openAddHouse([e.latlng.lat,e.latlng.lng])`), while the address is a free-text input (scripts.js:944). It only borrows zip/city from the nearest existing house (nearZip, scripts.js:938-941) - not coordinates. (3) The CSV import path explicitly gives up when coordinates are absent: scripts.js:1583 'Rows without lat/lng are skipped (geocode them first).' (4) The native host's pushProperties copies only client-supplied fields via pick(row, PROPERTY_COLUMNS) and does no address->lat/lng conversion: host.ts:695-725. (5) Mapbox references are tile layers only (satellite/streets basemaps), NOT geocoding: scripts.js:21, 699-700. So lat/lng exist only when (a) a rep taps the map to add a house, or (b) an imported CSV row already ships lat/lng. Severity: LOW-MEDIUM - not a bug/regression, it is a known product gap; the map still works for tapped additions and pre-geocoded imports. The claim in docs/dial-smart-app-map.md:142 is accurate.

**evidence**

- supabase/migrations/20261102234500_door_to_door_core.sql:62
- src/packs/door_to_door/app/scripts.js:942-955
- src/packs/door_to_door/app/scripts.js:951
- src/packs/door_to_door/app/scripts.js:934
- src/packs/door_to_door/app/scripts.js:1583
- src/packs/door_to_door/app/scripts.js:21
- src/packs/door_to_door/app/scripts.js:699-700
- src/packs/door_to_door/host.ts:695-725
- src/lib/d2dApi.ts:52
- src/lib/d2dApi.ts:104-105
- src/lib/d2dApi.ts:180

**validation**

Repo-wide searches executed: (a) regex 'geocod' -> 32 matches in 25 files, ALL are the geocode_status column listing (types.ts:2521,2556,2591; d2dApi.ts:52,180; host.ts:129; migration:62), docs, or the vendored app's CSV note at scripts.js:1583 - none perform geocoding. (b) findstr for 'maps/api/geocode','reverseGeocode','reverse_geocode','geocodeAddress','GOOGLE_MAPS_API' across src and api-gateway -> 0 matches. (c) findstr 'geocode' in the 20261103* workspace/members migrations -> 0 matches. (d) Read d2dApi.ts in full (344 lines), scripts.js:900-1018, host.ts:660-790, and the core migration:1-120 to confirm no coordinate derivation from address. (e) findstr for Nominatim/Mapbox/Google Maps: Mapbox hits are basemap tiles only; Google Maps hits are turn-by-turn URL builders (scripts.js:1101,3467), not geocoding.

**open_questions**

- Does anything OUTSIDE this repo (a cron on Hermes, a Dashboard/n8n job, or a manual back-fill script) assign lat/lng to newly-imported properties? Not evident in-repo.
- The DoorBoss original the pack was vendored from: did it ever have a geocoder that was dropped in the port? Not checked in this repo's history.
- Is geocode_status ever consumed/displayed in the UI to prompt a rep to geocode a row?

**edge_cases_considered**

- Hand-added house: coordinates come from map click, not typed address -> no geocoding needed for the pin, but the typed address is never verified/normalised against coordinates
- CSV bulk import: rows lacking lat/lng are dropped, not geocoded (scripts.js:1583)
- Offline queue replay: host.pushProperties still does no geocoding (host.ts:695-725)
- Mapbox presence: could be mistaken for a geocoder but is only raster/vector tile basemaps
- geocode_status column: exists but is inert (default 'ok'; no writer sets 'queued'/'failed')

**what_i_did_not_check**

- I did not query the live Supabase project (emonjusymdripmkvtttc) to inspect actual geocode_status/lat-lng distribution, so I cannot say how many live rows lack coordinates.
- I did not exhaustively open all ~200 migrations or every one of ~78 edge functions line-by-line; I relied on repo-wide findstr/agentgrep for geocode and known map providers (no geocoding call surfaced), plus full reads of the door_to_door files.
- I did not run the app or exercise the Add-house/CSV flows at runtime.
- I did not inspect git blame/history or the pre-port DoorBoss source for a removed geocoder.
- I did not check external orchestrators (Hermes crons, n8n) for an out-of-band geocoding job.

**confidence**: high