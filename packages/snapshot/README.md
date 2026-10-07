# Brocante snapshot

Private package shared by the CLI and bb plugin. It builds the web app’s `Marketplace` component,
3D scene, styles, fonts, and logo into a self-contained HTML snapshot.

Saved markets support local search, pagination, review filters, PR details, and list view. They contain
no credentials and make no API requests. Refreshing or changing repositories requires a new capture.
Description images remain links to their original hosts.

`pnpm build:snapshot` generates the browser bundle. CLI packing and plugin builds run this automatically;
both distribute the bundle without runtime workspace dependencies.
