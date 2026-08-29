#!/usr/bin/env bash
# Duo 💛 — one-shot production deploy.  Run from duo/:   bash scripts/deploy-prod.sh
# Reads .env.prod (git-ignored). Idempotent: safe to re-run after fixing anything.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.prod ] || { echo "✗ .env.prod missing"; exit 1; }
set -a; . ./.env.prod; set +a
need() { [ -n "${!1:-}" ] || { echo "✗ $1 is blank in .env.prod"; exit 1; }; }
for v in SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_ACCESS_TOKEN VERCEL_TOKEN; do need $v; done
export SUPABASE_ACCESS_TOKEN
VT=(--token "$VERCEL_TOKEN"); [ -n "${VERCEL_TEAM:-}" ] && VT+=(--scope "$VERCEL_TEAM")
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# ---- 0. CRON_SECRET --------------------------------------------------------
if [ -z "${CRON_SECRET:-}" ]; then
  CRON_SECRET=$(openssl rand -hex 32)
  sed -i '' "s|^CRON_SECRET=.*|CRON_SECRET=$CRON_SECRET|" .env.prod
  say "generated CRON_SECRET → saved to .env.prod"
fi

# ---- 1. Database: link + migrations ---------------------------------------
say "1/6  Supabase: link + db push"
npx supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD" >/dev/null
npx supabase db push --password "$SUPABASE_DB_PASSWORD" --yes

# ---- 2. Storage buckets (private) -----------------------------------------
say "2/6  Supabase: storage buckets"
mk_bucket() { # name size_bytes
  code=$(curl -s -o /tmp/duo-bucket.json -w '%{http_code}' -X POST "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/bucket" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
    -d "{\"id\":\"$1\",\"name\":\"$1\",\"public\":false,\"file_size_limit\":$2,\"allowed_mime_types\":[\"image/png\",\"image/jpeg\",\"image/webp\",\"image/heic\"]}")
  case $code in
    200|201) echo "  ✓ $1 created";;
    400|409) grep -q -i "already exists" /tmp/duo-bucket.json && echo "  ✓ $1 exists" || { cat /tmp/duo-bucket.json; exit 1; };;
    *) cat /tmp/duo-bucket.json; exit 1;;
  esac
}
mk_bucket checkins 5242880; mk_bucket moments 5242880; mk_bucket avatars 2097152

# ---- 3. Auth: password sign-in, NO emails ---------------------------------
auth_patch() { # $1 = JSON body
  code=$(curl -s -o /tmp/duo-auth.json -w '%{http_code}' -X PATCH "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/config/auth" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d "$1")
  [ "$code" = 200 ] || { echo "✗ auth config ($code):"; cat /tmp/duo-auth.json; exit 1; }
}
say "3/6  Supabase: auth (email+password, confirmations OFF)"
auth_patch '{"external_email_enabled":true,"mailer_autoconfirm":true,"disable_signup":false,"password_min_length":6,"security_update_password_require_reauthentication":false}'
echo "  ✓ no confirmation emails; sign-up creates a live session"

# ---- 4. Vercel: project + env ---------------------------------------------
say "4/6  Vercel: link project + env vars"
[ -f .vercel/project.json ] || npx vercel link --yes --project duo "${VT[@]}" >/dev/null
npx vercel git connect "${VT[@]}" --yes >/dev/null 2>&1 || echo "  (git connect skipped — pushes won't auto-deploy; CLI deploys still work)"
set_env() { # name value [secret]  — --force + explicit sensitivity so the CLI never prompts
  local flag=--no-sensitive; [ "${3:-}" = secret ] && flag=--sensitive
  printf '%s' "$2" | npx vercel env add "$1" production --force $flag "${VT[@]}" >/dev/null 2>&1 || { echo "✗ env add $1 failed"; exit 1; }
  echo "  ✓ $1"
}
set_env NEXT_PUBLIC_SUPABASE_URL "$NEXT_PUBLIC_SUPABASE_URL"
set_env NEXT_PUBLIC_SUPABASE_ANON_KEY "$NEXT_PUBLIC_SUPABASE_ANON_KEY"
set_env SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY" secret
set_env CRON_SECRET "$CRON_SECRET" secret

# ---- 5. Deploy, learn the URL, set it everywhere, deploy again ------------
say "5/6  Vercel: first deploy"
npx vercel deploy --prod --yes "${VT[@]}" >/tmp/duo-deploy.txt 2>&1 || { cat /tmp/duo-deploy.txt; exit 1; }
if [ -z "${NEXT_PUBLIC_APP_URL:-}" ]; then
  PJ=$(cat .vercel/project.json); PID=$(echo "$PJ" | jq -r .projectId); OID=$(echo "$PJ" | jq -r .orgId)
  ALIAS=$(curl -s "https://api.vercel.com/v9/projects/$PID?teamId=$OID" -H "Authorization: Bearer $VERCEL_TOKEN" \
    | jq -r '.targets.production.alias[]? // empty' | grep -v '\-git\-' | grep -E '^[a-z0-9-]+\.vercel\.app$' | head -1 || true)
  [ -n "$ALIAS" ] || ALIAS=$(grep -oE 'https://[a-z0-9.-]+\.vercel\.app' /tmp/duo-deploy.txt | tail -1 | sed 's|https://||')
  NEXT_PUBLIC_APP_URL="https://$ALIAS"
  sed -i '' "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL|" .env.prod
fi
echo "  app URL: $NEXT_PUBLIC_APP_URL"
set_env NEXT_PUBLIC_APP_URL "$NEXT_PUBLIC_APP_URL"
auth_patch "{\"site_url\":\"$NEXT_PUBLIC_APP_URL\",\"uri_allow_list\":\"$NEXT_PUBLIC_APP_URL,$NEXT_PUBLIC_APP_URL/auth/callback,$NEXT_PUBLIC_APP_URL/**\"}"
echo "  ✓ Supabase site URL + redirects set"
say "6/6  Vercel: final deploy with the app URL baked in"
npx vercel deploy --prod --yes "${VT[@]}" >/tmp/duo-deploy.txt 2>&1 || { cat /tmp/duo-deploy.txt; exit 1; }

# ---- smoke test -------------------------------------------------------------
say "smoke test"
code=$(curl -s -o /dev/null -w '%{http_code}' "$NEXT_PUBLIC_APP_URL/"); echo "  landing: HTTP $code"
code=$(curl -s -o /dev/null -w '%{http_code}' "$NEXT_PUBLIC_APP_URL/login"); echo "  login:   HTTP $code"
code=$(curl -s -o /dev/null -w '%{http_code}' "$NEXT_PUBLIC_APP_URL/api/keepalive"); echo "  cron w/o secret: HTTP $code (401 = correct)"
code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $CRON_SECRET" "$NEXT_PUBLIC_APP_URL/api/keepalive"); echo "  cron w/ secret:  HTTP $code (200 = correct)"
say "🎉 Duo is live at $NEXT_PUBLIC_APP_URL — open it on both phones, Sign in, Add to Home Screen."
