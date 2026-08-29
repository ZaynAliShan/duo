# Runs the Supabase CLI inside compose. It talks to the host's Docker daemon (socket mount) and starts the
# local Supabase stack (Postgres, Auth, REST, Realtime, Storage, Studio, Mailpit) as sibling containers,
# applying supabase/migrations + seed.sql + buckets + email templates exactly like `supabase start`.
FROM node:22-alpine
RUN apk add --no-cache docker-cli curl bash socat && npm i -g supabase@2.116.0 && supabase --version
WORKDIR /project
COPY docker/supabase-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
