#!/bin/bash
# Start the Supabase local stack and keep this container alive as its supervisor; stop it on shutdown.
set -eo pipefail
cd "$PROJECT_DIR"
rm -f /tmp/ready

# install the shutdown hook FIRST — a `docker compose down` that lands mid-start must still stop the stack
# (`supabase stop` keeps the data volume; `npm run db:reset` wipes it on purpose)
stop() {
  echo "stopping supabase…"
  supabase stop || true
  exit 0
}
trap stop TERM INT

# The CLI talks to the stack on 127.0.0.1, but the sibling containers publish their ports on the host —
# forward those ports from inside this container to the host.
for p in 54321 54322 54323 54324; do
  socat TCP-LISTEN:$p,fork,reuseaddr TCP:host.docker.internal:$p &
done

PROJECT_ID=$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml)
DB_CONTAINER="supabase_db_${PROJECT_ID:-duo}"
ANON="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0}"

if curl -sf -H "apikey: $ANON" "http://host.docker.internal:54321/rest/v1/" >/dev/null 2>&1; then
  echo "supabase already running and healthy — leaving it be (started by another tool, e.g. npm run dev:local)"
else
  # a half-started stack from an earlier run makes `start` bail out — settle it first (data volume is kept)
  supabase stop >/dev/null 2>&1 || true
  supabase start -x edge-runtime,vector,logflare,imgproxy,supavisor 2>&1 | grep -vE "Pull complete|Download|Extracting|Waiting|Verifying|Pulling fs|Already exists" &
  wait $! || { echo "supabase start failed"; exit 1; }
fi
# self-heal: an existing-but-empty volume makes `start` skip migrations — detect a missing schema and apply it
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "apikey: $ANON" "http://127.0.0.1:54321/rest/v1/questions?select=id&limit=1")
  [ "$code" != "000" ] && [ "$code" != "503" ] && break; sleep 2
done
if [ "$code" = "404" ]; then
  echo "schema missing — applying migrations + seed (supabase db reset)…"
  supabase db reset --no-seed=false 2>&1 | tail -3 || supabase db reset 2>&1 | tail -3
fi
# PostgREST's schema cache can lag a restored database by a few seconds — nudge it
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -qc "notify pgrst, 'reload schema'" >/dev/null 2>&1 || true
echo "💛 supabase ready — API http://127.0.0.1:54321 · Studio http://127.0.0.1:54323 · emails http://127.0.0.1:54324"

touch /tmp/ready
while true; do sleep 3600 & wait $!; done
