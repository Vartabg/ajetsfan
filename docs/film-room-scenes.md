# Film Room imagery and generation record

The Film Room uses original replay sources for study, with clearly attributed still imagery alongside them. Neither a still nor a generated illustration establishes the play's movement, coverage or blocking assignments. No generated image is described as documentary footage.

## Published assets

| Case | Displayed media | Provenance |
| --- | --- | --- |
| Wilson at Cleveland, September 18, 2022 | Original archival photograph, served from the official CDN | [Jets comeback report](https://www.newyorkjets.com/news/jets-shock-browns-with-13-point-comeback-in-last-2-minutes-for-31-30-win). The source preserves Wilson's number 17 and Browns defenders 22 and 28. No individual photographer credit is supplied on that article; none is inferred from its author. |
| Sanchez against New England, November 22, 2012 | AI-generated scene recreation | `public/media/reconstructions/sanchez-thanksgiving-2012.webp`, 1672×941, 110,852 bytes. Reference: [NFL postgame report and tight archival frame](https://www.nfl.com/news/mark-sanchez-stunned-by-new-york-jets-butt-fumble-0ap1000000102529). The reference omits the ball and most of the lineman; the recreation retains that limited crop. |

The Sanchez illustration was created with the **built-in image-generation tool in edit mode**, using the inspected archival reference. The PNG was converted to WebP with Sharp, quality 86, without resizing or artistic alterations. The publication labels it “AI-generated scene recreation,” links its reference and states its evidentiary limits. Added photographic microtexture is synthesized; it is not recovered detail from the broadcast. The replay and the quarterback's sourced account are separate.

## Final published generation prompt

```text
Asset type: photographic AI scene recreation of the supplied NFL archival frame, explicitly labeled as generated outside the image. Preserve the same very tight 16:9 crop and original camera view of Mark Sanchez falling bent forward in the November22,2012 Jets-Patriots game. Preserve the number6 green2012Jets jersey with white panels, white helmet with green stripes, relative pose and upside-down SANCHEZ nameplate due to the bent-over position. Preserve the visible teammate leg at left with green and white socks, grass, and only the bodies visible in this reference. The ball and most of the lineman are outside this crop: do NOT add them, expand the scene, invent the collision geometry, add defenders or make a wider view. Faithfully render this limited archival composition with natural photographic fabric and skin texture, restrained grain, believable stadium lighting. Keep all player identity and uniform details, body orientation and relative placement anchored to the reference. No scoreboards, arrows, text overlays, logos added beyond uniforms, watermarks, invented injuries, dramatic cinematic lighting or futuristic stylization. This is a source-based recreation of one frame, not original documentary footage.
```

## Withheld variants

Three Wilson generation attempts were inspected and withheld. The first changed the falling defender's number; later corrections still altered jersey/nameplate details. The original source photograph meets the identity requirement more reliably. None of those variants is included in the repository or used by the product.

## Football evidence

Case definitions live in `src/lib/film-room.ts`. They retain exact original archive rows, verified gamebook situations, attributed source accounts, unresolved assignments and official replay links. Hosted checks confirmed that all three verified NFL-owned YouTube sources block embedded playback. The viewer therefore links directly to the official replay and YouTube in new tabs; no third-party player or autoplay is inserted. There are no invented playback offsets or All-22 claims.

The coverage and pressure board is a separate teaching schematic. It assigns exactly eleven defenders in compatible packages and uses a legal illustrative formation with five eligible receivers. It never claims to reconstruct a selected game's actual call or tracking coordinates.
