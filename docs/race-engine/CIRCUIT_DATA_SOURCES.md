# Circuit Geometry Source Policy

**Status:** Research-backed ingestion policy; no third-party circuit geometry has been imported into production.
**Applies to:** CALERIS RACE ENGINE circuit import, editing, review, and official-release gates.

## 1. Source candidates and known limitations

### 1.1 bacinger/f1-circuits

Repository: https://github.com/bacinger/f1-circuits

- Publishes circuit outlines in GeoJSON and circuit-location GeoJSON/JSON.
- Repository declares the MIT License.
- Its README acknowledges upstream sources including a community Google Maps drawing and Wikipedia, and says altitude values were gathered from mixed sources including published articles, official websites, wiki pages, and nearby-city altitude when more accurate data was unavailable.
- The repository explicitly states that its circuit data is unofficial and is not approved or endorsed by Formula One Licensing B.V.
- Treat it as a candidate outline source only. It is not sufficient by itself to establish current track geometry, elevation fidelity, corner radii, pit-lane geometry, track limits, DRS zones, or simulation-grade accuracy.

### 1.2 TUMFTM/racetrack-database

Repository: https://github.com/TUMFTM/racetrack-database

- Publishes centerlines, left/right track widths, and calculated race lines for more than 20 tracks.
- Its README says centerlines originate from OpenStreetMap GPS points and are smoothed; widths were extracted from satellite imagery; race lines are calculated using a minimum-curvature optimization method.
- The README warns that source quality varies by location, that smoothed centerlines may not remain exactly at track center, and that output accuracy must be checked for the intended application.
- The repository contains an LGPL-3.0 license. The README separately identifies OpenStreetMap as the source of original centerlines. Before redistributing imported data, review the exact data lineage and applicable ODbL obligations; do not assume the repository's code license alone settles the data license.

### 1.3 OpenStreetMap

- OpenStreetMap data is distributed under the Open Database License (ODbL) 1.0.
- Public use requires appropriate attribution. Derivative databases distributed to others carry share-alike obligations. Produced-work and database obligations differ, so legal review must classify the actual use before release.
- OSM geometry is a source of mapped geographic features, not a guarantee of motorsport engineering measurements. A mapped raceway can be incomplete, outdated, or represent the wrong boundary.

### 1.4 FastF1 and timing feeds

- A software library license does not automatically grant rights to redistribute or commercially use the underlying championship timing or telemetry data.
- Do not ingest or redistribute proprietary timing/telemetry merely because an open-source client can retrieve it. Obtain and record explicit data-use permission first.

## 2. Required provenance for every real circuit

A real circuit cannot pass official-release validation unless its immutable revision stores:

1. Provider and canonical source URL (HTTPS).
2. Exact source revision, dataset version, or source object identifier.
3. License identifier and required attribution text.
4. Retrieval timestamp.
5. SHA-256 digest of the imported source geometry.
6. Source method for centerline, width, elevation, sectors, pit lane, DRS, and track limits.
7. Known limitations and fields that remain unknown.
8. Named reviewer and review timestamp.
9. A verified fidelity decision after comparing the geometry and measured specifications with an authoritative reference.

Do not fabricate missing values. Keep unknown fields null/unavailable and prevent the circuit from passing release validation until required measurements are independently verified.

## 3. Ingestion and review rules

- Preserve the untouched source file and its hash separately from normalized engine geometry.
- Keep source license and attribution metadata with each circuit revision; do not merge sources with incompatible terms without a documented review.
- Normalize coordinates only through a versioned import procedure that records coordinate reference system, units, projection, and transformation parameters.
- Validate closure, segment ordering, sector distance, total length, widths, pit entry/exit, track limits, DRS zones, and elevation continuity.
- Compare the normalized result with an independent reference. A visual outline alone is not proof of exact geometry.
- Mark approximate or unreviewed data as non-production. Synthetic geometry is test-only.
- Any source update creates a new circuit revision; never silently rewrite the geometry used by historical races.

## 4. Official release gate

The code-level provenance gate requires a declared circuit kind. Synthetic circuits are test-only. Real circuits require complete source provenance, a SHA-256 source hash, a license and attribution record, a source revision, and a completed fidelity review. A geometry-valid circuit is not automatically an officially approved circuit.

## 5. Primary references

- OpenStreetMap copyright and ODbL summary: https://www.openstreetmap.org/copyright
- OpenStreetMap Foundation attribution guidelines: https://osmfoundation.org/wiki/Licence/Attribution_Guidelines
- bacinger/f1-circuits README and license declaration: https://github.com/bacinger/f1-circuits
- TUMFTM/racetrack-database README and license: https://github.com/TUMFTM/racetrack-database

This document is a technical source-governance policy, not legal advice or an assertion that any particular third-party dataset has already been cleared for CALERIS commercial use.
