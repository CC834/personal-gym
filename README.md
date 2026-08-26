# Personal Gym

A private, minimalist workout tracker for weekly planning, set-by-set logging, confirmed double progression, body-weight history, exercise trends, and interactive 2D muscle maps.

Plan highlights the primary and supporting muscles trained each day. Selecting a highlighted muscle opens the exercise library with matching primary and secondary exercises, while Today provides a compact read-only workout summary.

## Runtime

- Private URL: `/gym/`
- Loopback service: `127.0.0.1:18830`
- Configuration: `/home/ct/.config/personal-gym/config.json`
- SQLite data: `/home/ct/.local/share/personal-gym/gym.sqlite3`
- Licensed media: `/home/ct/.local/share/personal-gym/catalog-media/`

The app requires the configured `Tailscale-User-Login` header. It has no runtime dependency on GitHub or another exercise API.

## Exercise catalog

Eight starter exercises make a fresh install usable. To import the full metadata-only catalog, download a pinned `data/exercises.json` revision from `hasaneyldrm/exercises-dataset`, then run:

```sh
GYM_CONFIG=/home/ct/.config/personal-gym/config.json npm run catalog:import -- --source /path/to/exercises.json --revision <commit-sha>
```

The metadata and instructions are MIT-licensed. Images and GIFs are not. They are never downloaded automatically. After obtaining the necessary rights and supplying a local copy of the dataset, validate and import its 180×180 media with:

```sh
GYM_CONFIG=/home/ct/.config/personal-gym/config.json npm run catalog:media -- --source /path/to/licensed/exercises-dataset
```

The importer requires the upstream notice, rejects missing or non-180×180 files, copies only paths referenced by imported metadata, and preserves `NOTICE.md`.

## Development

```sh
npm run check
npm test
```

The HTTP test binds a temporary loopback port. Production runs through the restrictive user systemd unit in `deploy/`.
