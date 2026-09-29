#!/bin/sh
set -e
PROJECT="$1"
if [ -z "$PROJECT" ]; then
  echo "usage: deploy/gcp-secrets.sh <project-id>"
  exit 1
fi
for NAME in ANTHROPIC_API_KEY DEEPGRAM_API_KEY CALL_TOKEN_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET TOKEN_ENCRYPTION_KEY; do
  VALUE=$(grep -E "^$NAME=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
  if [ -z "$VALUE" ]; then
    echo "skipped $NAME (not in .env)"
    continue
  fi
  if gcloud secrets describe "$NAME" --project "$PROJECT" >/dev/null 2>&1; then
    if [ "$NAME" = "TOKEN_ENCRYPTION_KEY" ]; then
      echo "kept $NAME (already set on the host)"
      continue
    fi
    printf '%s' "$VALUE" | gcloud secrets versions add "$NAME" --project "$PROJECT" --data-file=- >/dev/null
  else
    printf '%s' "$VALUE" | gcloud secrets create "$NAME" --project "$PROJECT" --replication-policy=automatic --data-file=- >/dev/null
  fi
  echo "stored $NAME"
done
