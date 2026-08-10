# TripOS — Ubiquitous Language

Glossary of domain terms. Definitions only — no implementation details.

## Trip

A single journey the user physically takes, possibly spanning multiple destinations (e.g. "Japan 2026" covering Tokyo, Kyoto, Osaka). Has **trip dates**: the start and end of physical travel. Trip dates drive the day-by-day timeline and reservation auto-assignment.

## Trip dates

The period the user is physically traveling. Both start and end are **optional at trip creation** — they are often unknown until flights are booked (the chicken-and-egg of an ingestion app). Missing dates just mean weaker date evidence for assignment. As reservations accumulate, the app may *suggest* firming them up from the earliest/latest reservation; user-confirmed dates stay canonical. Distinct from the **booking window** — confirmation emails almost always arrive *before* the trip starts. The trip's home timezone is likewise optional until known.

## Booking window

The period during which the user booked reservations for a trip, expressed as email *received* dates. Has a required **booking window start** ("when I started booking this trip") and an optional **booking window end**. The booking window is a **hard bound**: emails received outside it are never considered for the trip. Not the same as trip dates: a November trip may have a booking window starting in June.

## Extraction confidence

How sure the AI is that it read a source (email, upload) into a structured reservation correctly. One of two independent scores on an extraction candidate.

## Assignment confidence

How sure the AI is that an extraction candidate belongs to a particular trip, weighing soft evidence: trip dates, destinations, geographic proximity (same country/region), and email content. The other of the two independent scores. Trip assignment is probabilistic — there is no deterministic date-range rule (see ADR 0001).

## Destination

A place name supplied by the user as part of a trip's constraints, at any granularity — region ("Europe"), country ("France"), or city ("Kyoto"). A trip has a set of destinations. Destinations are an **ingestion scoping signal**: soft evidence the AI uses to decide that an email belongs to a given trip, including containment reasoning ("Lyon is in France"). They are *not* venue-level Locations, and they do not define the itinerary's structure — city grouping in the timeline remains derived from reservation locations. Scoping interpretations are fallible; the user can reassign wrongly-grouped reservations afterwards.

## Trip brief

Optional free-text prose describing a planned trip ("I'm planning a trip to Europe — France, Austria, and Italy in June 2027"). The AI parses it to pre-fill the trip's structured constraints, which the user confirms — the structured constraints are canonical. The raw brief is kept on the trip and handed to the AI as additional assignment evidence, since prose carries nuance a parsed field list loses.

## Trip constraints

The structured, user-confirmed inputs that scope ingestion for a trip: destination set, trip dates, and booking window. Canonical over any trip brief they were parsed from. **Invariant: a trip cannot exist without constraints** — trip creation completes only when constraints are confirmed; abandoning the prompt leaves no trip behind.

## Reservation

A confirmed booking (flight, lodging, dining, activity, transit) belonging to a trip.

## Location

A venue-level place (a hotel, a station, a restaurant) with geographic identity. Attached to reservations, not trips.

## Extraction candidate

A structured reservation proposal produced by AI from an email or upload, awaiting review, auto-promotion, or rejection.

## Needs-trip inbox

Where an extraction candidate lands when its **assignment confidence** is below threshold. The AI's best-guess trip is pre-selected so manual triage is a single confirmation. (Formerly defined by the deterministic date-range rule; see ADR 0001.)

## Backfill

The one-time ingestion sweep triggered when a trip is created or its booking window widened: emails inside that trip's booking window that were never extracted get fetched and extracted. Distinct from ongoing incremental sync.

## Re-scoring

Recomputing assignment confidence for existing pending / needs-trip candidates when the trip set changes. Never re-extracts, and never touches already-promoted reservations — promotion settles a reservation; moving it afterwards is a manual act.

## Auto-promotion

An extraction candidate becomes a reservation without review when *both* extraction confidence and assignment confidence clear their thresholds. User corrections afterwards (reassignment, edits, deletion) are treated as signals that a promotion was wrong — a possible future feedback input, not a current mechanism.
