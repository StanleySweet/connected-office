# The relay, one process, no dependencies. Built for linux/amd64 (the NAS this was written for is x86_64). The timezone is pinned: the office's day and hour buckets must not depend on the host.
FROM node:24-alpine

ENV TZ=Europe/Paris \
    OFFICE_TZ=Europe/Paris \
    NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=7311 \
    CACHE_DIR=/data

WORKDIR /app
COPY relay ./relay
# The relay only draws: the plugin's lib/ and themes/ (lib imports ../themes/default.json), not the whole upstream repo.
COPY vendor/theoffice-agents/plugin/lib ./vendor/theoffice-agents/plugin/lib
COPY vendor/theoffice-agents/plugin/themes ./vendor/theoffice-agents/plugin/themes
COPY vendor/theoffice-agents/LICENSE ./vendor/theoffice-agents/LICENSE

RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 7311
CMD ["node", "relay/server.mjs"]
