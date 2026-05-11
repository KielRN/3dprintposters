# Print File Generator Test Layout

Use this suite layout to keep new print-file capabilities isolated by concern.

## Directories

- `contract/`: API and bundle contract tests for `/v1/generate`, response shapes, storage paths, and metadata schema.
- `unit/`: focused tests for individual providers, mesh generation, printability, quality gates, transforms, and package helpers.
- `integration/`: end-to-end local bundle tests that exercise multiple modules together. Add tests here for color packages once the full-color path writes real artifacts.
- `support.py`: shared test doubles for provider-backed flows, such as fake monocular depth and subject masks.

## Color Package Test Homes

- Put texture and color-space helpers in `unit/test_color_texture.py`.
- Put 3MF/OBJ/MTL/package-manifest checks in `unit/test_color_package_manifest.py`.
- Put one-source-image-to-full-bundle checks in `integration/test_generate_color_bundle.py`.

Keep partner-specific expectations explicit in test names once a Mimaki or comparable partner confirms accepted formats, units, texture requirements, and material profiles.
