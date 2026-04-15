# Expression Driving Images for LivePortrait

This directory contains face images used as "driving" references by LivePortrait.
Each image shows a face with a specific expression. LivePortrait transfers the
expression from the driving image onto the user's source photo.

## Required Files

| File | Expression | Description |
|---|---|---|
| `surprised.png` | Surprised | Wide eyes, raised eyebrows, open mouth |
| `excited.png` | Excited/Happy | Big smile, bright eyes, slightly open mouth |
| `serious.png` | Serious/Confident | Neutral expression, direct gaze, closed mouth |
| `concerned.png` | Concerned/Worried | Furrowed brow, slight frown |
| `angry.png` | Angry/Frustrated | Furrowed brows, clenched jaw, intense eyes |
| `sad.png` | Sad/Empathetic | Downturned mouth, soft eyes |

## Requirements

- **Format**: PNG, 512×512 pixels
- **Subject**: Clear, well-lit face, front-facing
- **Background**: Clean/neutral (doesn't matter much since LivePortrait focuses on facial landmarks)
- **Consistency**: Similar lighting and framing across all images so LivePortrait transfers ONLY the expression, not lighting/angle artifacts

## Sourcing Options

1. **Stock expressions dataset**: AFFECTNET, FER2013, or similar facial expression databases
2. **Custom photos**: Take 6 photos of the same person making each expression
3. **AI generated**: Use an image generation model to create consistent expression references

The driving images define the TARGET expression. LivePortrait will map the facial motion
from the driving image onto the source image while preserving the source person's identity.
