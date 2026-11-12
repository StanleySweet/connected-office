# connected-office

Several people, one [The Office](https://github.com/Makio64/theoffice-agents). Each laptop pushes its coding-agent
activity to a small relay, the relay merges everybody's facts and draws one shared office.

- `agent/`: runs on each laptop, collects the facts with `theoffice-agents`, redacts them (`relay/redact.mjs`) and pushes
  them every minute or so. `local.mjs` runs a private relay on the laptop alone.
- `relay/`: a single Node process, no dependencies. Keeps each person's last push, merges them, serves the SVG, ASCII
  and time-lapse views.
- `deploy/`: Dockerfile, a Compose file for the relay on the loopback, and an example Caddy block for TLS and viewer login.
- `features/`, `test/`: Gherkin features and their steps.

The drawing and the collector come from the submodule `vendor/theoffice-agents`, my fork of
`Makio64/theoffice-agents` (branch `feat/connected-office-features`, proposed upstream in
[Makio64/theoffice-agents#1](https://github.com/Makio64/theoffice-agents/pull/1)).

```
git clone --recurse-submodules https://github.com/StanleySweet/connected-office
node --test test/all.test.mjs
```

## Run the relay

```
cp deploy/tokens.example deploy/tokens   # one "<psk> <label>" line per person, chmod 600
./deploy/start.sh
```

Put a TLS reverse proxy in front (see `deploy/Caddyfile.extrait`). It must authenticate viewers and set `X-Office-User`;
`/ingest/*` is reached with each laptop's bearer token instead.

If the same repository has a different folder name on each machine, map the names to one room with the
`PROJECT_ALIASES` environment variable, for example `{"my-repo-clone":"my-repo"}`.

## Run an agent

```
cp agent/config.example.json agent/config.json   # relay URL and this laptop's token
node agent/push.mjs
```

`agent/installer-launchd.sh` (macOS) and `agent/installer-windows.ps1` install it as a login task.

## Licence

MIT. The vendored `theoffice-agents` is MIT too, copyright Makio64.
