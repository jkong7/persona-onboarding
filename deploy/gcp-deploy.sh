#!/bin/sh
set -e
PROJECT="${1:-persona-onboarding-jk}"
REGION="us-central1"
TAG="$(date +%Y%m%d-%H%M%S)"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/persona/app:$TAG"
gcloud builds submit --project "$PROJECT" --tag "$IMAGE" .
gcloud run deploy persona-onboarding --project "$PROJECT" --region "$REGION" --image "$IMAGE"
