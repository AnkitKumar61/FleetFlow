# Browser Acceptance Report

Date: 2026-08-12  
Application: `http://localhost:8080`  
API: `http://localhost:4000/api/v1`

## Browser coverage

The rebuilt Docker application was exercised in a real Chromium browser at a 1265 × 720 desktop viewport and a 390 × 844 mobile viewport.

- Authentication: demo login and logout for admin, manager, driver and customer; customer registration required-field validation.
- Admin: overview metrics, manifest, delivery detail, resource board, account roles, self-role protection, vehicle form validation and duplicate-resource error recovery.
- Manager: overview, delivery manifest, filters, resource board, pending-delivery cancellation action and assignment availability/empty state.
- Driver: assigned delivery detail, accepted, picked up and in-transit transitions, invalid OTP error/retry, successful OTP proof and delivered history.
- Customer: overview, manifest, exact tracking search, filters, empty search result, request form validation, delivery detail and pending-delivery cancellation.
- Responsive/accessibility: mobile drawer open/close, focus trap and Escape return, no verified horizontal overflow, no unlabeled visible controls, no sampled text contrast below 4.5:1, and no visible interactive target below 44 × 44 on the final mobile detail.
- Runtime diagnostics: the final pages produced no browser console warnings or errors. Rebuilt server logs contained 275 browser/health requests. The only 4xx responses were two expected refresh-token 401s after explicit sign-outs and the intentionally triggered duplicate-vehicle 409 used to verify inline error recovery; no unexpected request failed.

## Problems fixed during acceptance

- Replaced tokenized text search with escaped case-insensitive tracking/package matching so hyphenated tracking numbers return only their delivery.
- Added customer cancellation plus manager/admin operational transition actions that were supported by the API but absent from the UI.
- Kept delivery and resource pages mounted when mutations fail, preserving user context and input while announcing inline errors.
- Added loading and disabled states for filtering, pagination, status changes, assignment, proof and vehicle creation.
- Moved mobile realtime toasts away from primary header actions, increased dismissal target size and added automatic expiry.
- Stacked the dashboard before laptop-width status content clips, improved long-text wrapping and raised visible controls to the 44-pixel target floor.
- Prevented self-role changes and prevented assigned drivers/vehicles from being released or deactivated through resource updates.
- Stabilized transactional test setup by reusing a bcrypt hash and allowing sufficient Mongo hook time.

## Automated verification

```text
npm test
  server: 5 files passed, 22 tests passed, 279.02s
  client: 2 files passed, 2 tests passed, 10.82s

npm run lint
  ESLint exit 0, zero warnings

npm run build
  Vite 6.4.3, 2,269 modules transformed, built in 52.45s
  largest emitted chunks:
    dashboard-page: 357.09 kB (106.37 kB gzip)
    shared index:   285.57 kB (95.16 kB gzip)

npm audit
  found 0 vulnerabilities
```

## Docker status

- `client`: running and healthy — `http://localhost:8080`
- `server`: running and healthy — `http://localhost:4000`
- `mongo`: running and healthy — `mongodb://localhost:27017`
- `redis`: running and healthy — `redis://localhost:6379`
- `worker`: running; no healthcheck is defined in Compose
- `/health`: HTTP 200 with `status: ok`
- `/ready`: HTTP 200 with MongoDB and Redis both ready

## Screenshots

- [`admin-dashboard-desktop.png`](./screenshots/admin-dashboard-desktop.png)
- [`customer-delivery-mobile.png`](./screenshots/customer-delivery-mobile.png)

Both screenshots were captured from pages verified during this pass and show synthetic data only.

## Remaining limitations

- Browser coverage used the available Chromium browser on Windows; Safari, Firefox, physical iOS/Android devices and assistive-technology screen readers were not available in this environment.
- The worker is observable as a running container and was already covered by its automated idempotency test, but Compose does not define a worker healthcheck.
- Proof attachments still use local development storage; production requires private object storage as documented in deployment guidance.
