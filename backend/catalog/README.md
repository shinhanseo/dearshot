# Development catalog fixtures

`seed.json` and the `dev-*` assets are development-only fixtures. They verify the catalog contract, import transaction, localization fallback, asset delivery, and Android integration.

`waterfront-v1.json` is the first curated portrait set. Its six `templates/*/v1/` directories contain a full-size WebP preview, a smaller WebP thumbnail derived from the same image, and a transparent SVG camera guide. The five supplied beach portraits and the supplied riverside railing portrait are AI-generated examples; the earlier Instagram screenshots are not catalog assets. `build-waterfront-guides.mjs` regenerates the SVG guides from their measured 941 × 1672 coordinates. Each guide has a fixed normalized `targetSubjectBox` in the manifest for later on-device person-size comparison. The manifest is ready for review and import; importing it is a separate catalog operation.

Do not treat these samples as approved launch content. Replace them through a reviewed catalog manifest; do not edit a published template version in place.

## Selected cafe set

`cafe-v1.json` contains the six user-selected generated examples: original candidate numbers **1, 2, 4, 6, 7, 8**, in that order. Each version includes `preview.webp`, a 360px-wide `thumbnail.webp`, and a fixed transparent `guide.svg` with manually traced subject and dashed structural guides. All share the original 941 × 1672 coordinate space. These are composition cues, not pixel-perfect segmentation masks.

Run `node catalog/build-cafe-assets.mjs` to rebuild SVG guides, the manifest, and `docs/design/cafe-overlay-review.png` from existing previews. To regenerate WebP assets too, pass the original generated-image directory as the first argument. Instagram reference screenshots are not included.

The development Compose service mounts this catalog read-only. Register the selected set in the local database with `docker compose exec -T api npm run catalog:import -- catalog/cafe-v1.json` from the repository root. This adds the cafe set without removing other scenes.

## Selected green-space set

`green-space-v1.json` contains the selected generated candidates **1, 3, 6, 7, 8, 10**. Candidate 1 uses the corrected picnic image (hands on knees). Each has a WebP preview, thumbnail and fixed transparent SVG guide. The 940px-wide arch source is normalized to 941 × 1672 to match the guide coordinate space; these guides are manually drawn composition cues rather than segmentation masks.

Rebuild with `node catalog/build-green-space-assets.mjs` (from `backend`), optionally passing the generated-image directory to rebuild WebPs. The alignment sheet is `docs/design/green-space-overlay-review.png`. Import locally with `docker compose exec -T api npm run catalog:import -- catalog/green-space-v1.json`. Existing scene catalogs are preserved.

## Selected urban-street set

`urban-street-v1.json` contains the selected generated candidates **1, 4, 6, 7, 8, 10**, in that order: alley look-back, crossing step, campus walk, open plaza, street railing, and museum bench. Each has a WebP preview, 360 × 640 thumbnail, and fixed transparent SVG guide in the 941 × 1672 reference space. Solid lines are manually traced pose cues; dashed lines indicate spatial composition. These are composition guides, not segmentation masks.

Rebuild with `node catalog/build-urban-street-assets.mjs` from `backend`, optionally passing the original generated-image directory to rebuild WebPs. Review alignment in `docs/design/urban-street-overlay-review.png`. Register locally with `docker compose exec -T api npm run catalog:import -- catalog/urban-street-v1.json`. Other scenes are preserved; Instagram screenshots are not included.
