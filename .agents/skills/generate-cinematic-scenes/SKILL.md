---
name: generate-cinematic-scenes
description: Use this skill to generate immersive, cinematic background scenes for new 3D printed figurine styles while preserving the original character.
---

# Generate Cinematic Scenes Skill

When the user asks to generate new backgrounds or scenes for their monthly figurine styles, follow this strict protocol to ensure brand consistency and visual quality.

## Guidelines

1. **Preserve the Character**: Always instruct the image generator to "Keep the character exactly as they are, maintaining their original style and pose."
2. **Genre Matching**: Pick a background environment that matches the character's genre:
   - **Super Heroes**: Epic city skylines, dramatic rooftops, sunset/night scenes with glowing city lights.
   - **Heroic Fantasy**: Rugged mountain peaks, grand marble castle halls, ancient stone ruins, enchanted forests.
   - **Real-World / Photo Likeness**: Cozy living rooms with crackling fireplaces, bright sunlit cafe tables, warm wooden bookshelves.
3. **Lighting & Quality**: Always append the following to your prompts to maintain the premium brand aesthetic: "Cinematic lighting, warm and rich colors, shallow depth of field focusing on the figurine. High-quality product photography, emotional storytelling."
4. **Execution**: Use the `generate_image` tool, passing in the absolute path to the original `.webp` or `.png` source file in the `ImagePaths` parameter. Save the output to the appropriate public assets folder (e.g., `public/landing/cards/`).
