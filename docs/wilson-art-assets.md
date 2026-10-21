# Wilson Film Room art assets

License and file verification: October 20, 2026. These are presentation assets, not historical game evidence. They do not establish the appearance, weather or lighting of the actual Cleveland play.

The complete acquisition sources, packaging scripts, original licenses and bounded CPU audits are also preserved in the durable `source-assets/` directory listed in [wilson-handoff.md](wilson-handoff.md). Its inventory and checksums verify all 174 copied source files. The `/tmp/` paths below retain their original acquisition meaning; the handoff copy survives temporary-storage cleanup.

Actually incorporated: the two Grass 005 WebP maps and the selected free Quaternius body/four animation clips listed below. The football gear, uniforms, motion constraints, crowd, stadium and generated daylight/reflection environment are authored application work. No paid asset or downloaded Poly Haven sky is incorporated.

## Grass 005 — ambientCG

[Grass 005 asset page](https://ambientcg.com/view?id=Grass005) offers the [official 1K JPG bundle](https://ambientcg.com/get?file=Grass005_1K-JPG.zip). Its download redirected to `https://acg-download.struffelproductions.com/file/ambientCG-Web/download/Grass005_MPzT24Bl/Grass005_1K-JPG.zip`.

The [ambientCG license](https://docs.ambientcg.com/license/) states that asset downloads use [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/), including modification and redistribution in commercial projects. No signup, payment or explicit agreement acceptance was used. Credit is optional; retained provenance credit: “Grass 005 from ambientCG.”

Original ZIP: **10,442,657 bytes**, SHA-256 `58a7fb7f32c44a86879483325b62781d04e0ab8f70b0f70ede36c8f1726f8a22`.

The downloaded archive contains 1024×1024 color, OpenGL/DirectX normal, roughness, ambient occlusion and displacement maps, plus material/project files and a preview. The color, OpenGL normal and roughness maps were inspected visually. Only the color and OpenGL normal derivatives are included in the repository; the archive and unused maps remain outside Git at `/tmp/wilson-grass005-assets/`.

| Selected original map | Bytes | SHA-256 |
| --- | ---: | --- |
| `Grass005_1K-JPG_Color.jpg` | 1,875,015 | `5fd8edc1a04e2b9b093229dd0ec41f29668dda9fc698f6610b12cdd83b7690cb` |
| `Grass005_1K-JPG_NormalGL.jpg` | 2,137,845 | `f89e3a1701511d379a9772774ec6b9d7b7ccf3e944fdcc2b98c09dee4cfd804f` |

| Shipped derivative | Dimensions | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `public/film-room/art/grass005-basecolor.webp` | 1024×1024 RGB | 333,388 | `27c723198fc4fbe21f228471aa9c1cede569709532ac0030a8a5c1df6254d518` |
| `public/film-room/art/grass005-normalgl.webp` | 512×512 RGB | 95,866 | `112847f67b1c4305d72999c3dd913ae8f7685adc7e169201698f3d1813e382f0` |

Combined download size: **429,254 bytes** (419.2 KiB), below the 500 KB target. Pillow 12.1.1 converted color to WebP quality 84/method 6 at original resolution, and resized the OpenGL normal with Lanczos to 512×512 before WebP quality 90/method 6. Metadata was not copied. Files were decoded again to verify dimensions and integrity. The base color retains the grass-blade variation; the lower-resolution normal supplies subtler surface relief without shipping the multi-megabyte original. No color retouching or generated imagery was used.

The [official asset metadata query](https://ambientcg.com/api/v2/full_json?id=Grass005&include=dimensionsData&limit=1) returned `dimensionX=0`, `dimensionY=0`, `dimensionZ=0`; no usable physical tile size is supplied. Choose the repeat scale as an art decision rather than claiming a measured square-meter footprint.

The integration uses a restrained base-color tint, identical 32×3 repeat settings, OpenGL normal intensity 0.22 and scalar roughness. Repeat scale is an art decision. Both requests begin after the first configured 3D render. Held requests retain the existing field; a failed map leaves the successful map or fallback material available. Late callbacks check scene ownership before applying results, and textures are disposed with the scene. Browser tests cover delayed arrival and a failed normal map while playback and selection remain usable.

## Optional sky — Poly Haven

Asset: [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky), original by Greg Zaal, sky edits by Jarod Guest. The [official Poly Haven license](https://polyhaven.com/license) identifies its HDRIs as CC0 and permits modification and redistribution, including commercial use. The asset page also labels this specific asset CC0. Website text and example renders are separate from the downloadable CC0 asset.

The asset page links the [official files manifest](https://api.polyhaven.com/files/kloofendal_48d_partly_cloudy_puresky), which supplies the [1K HDR download](https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr). Downloaded file:

- Outside Git only: `/tmp/wilson-kloofendal_48d_partly_cloudy_puresky_1k.hdr`
- Radiance RGBE, 1024×512; **1,435,119 bytes**.
- SHA-256: `fd94c84997b8a3c353b62c2125a9b44e19509956986a126e472684432a02d798`.
- MD5: `c69498687e876bf68d2a8b8a62234eb9`, matching the official files manifest.

This HDRI is **not bundled**. Recommendation: consider it as optional outdoor environment lighting after the first usable frame, with a local gradient retained during loading. Its extra 1.44 MB exceeds the grass-map budget and is unnecessary for initial delivery. If integrated later, document the added transfer and dispose converted environment resources with the scene. It is illustrative lighting, not a reconstruction of the game's sky.


## Quaternius — selected runtime body and motion

The runtime body and four motion clips are from the **free Standard editions** of [Universal Base Characters](https://quaternius.itch.io/universal-base-characters), also described on the [creator's asset page](https://quaternius.com/packs/universalbasecharacters.html), and [Universal Animation Library](https://quaternius.itch.io/universal-animation-library). Both downloaded Standard archives contain an explicit **CC0 1.0 Universal** license. The body archive's original license remains in the acquisition source outside Git (806 bytes, SHA-256 `0f4beaf0fe360a7732e58bbe3dbf60a2422367fbea60cb9ea4add968f383268e`). The shipped copy at `public/film-room/art/quaternius-cc0.txt` is 782 bytes, SHA-256 `c232257c8a2545520aa120cda96acb23d00a355d2e3339cba20b7ebf56f28a09`; only CRLF line endings and two trailing spaces were normalized for the repository whitespace gate, with license wording unchanged. The acquisition used anonymous free downloads; no purchase, account or paid edition was needed.

Only the selected runtime derivatives are included in Git. Original archives remain outside the repository:

| Free source archive | Bytes | SHA-256 |
| --- | ---: | --- |
| `Universal Base Characters[Standard].zip` | 128,968,391 | `fdbf1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40` |
| `Universal Animation Library[Standard].zip` | 15,904,933 | `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724` |

### Runtime body

Selected source: `Base Characters/Godot - UE/Superhero_Male_FullBody.gltf`, SHA-256 `e7fcea214ecf8855afbf910b50de6f9c7d1decfb71ca28bad8a4481452dafeb4`, with its 720,076-byte `.bin`, SHA-256 `459003f9745853ae562a85506a2b94dd56515c1f37728f9fa3d2ce1a3e4cd92f`. The runtime file is:

- `/film-room/art/quaternius-football-body.glb`
- **789,216 bytes**, SHA-256 `98d8716b1c03d6d54ac62b6bbeaf0930ae11bff1598c286660f3edac9c49f522`.
- 69 nodes, 65 skin joints, three skinned primitives/materials, 8,483 vertices and 14,318 triangles. No animation clips are embedded in the body.

The original geometry/skin binary is retained **byte-for-byte at offset zero**. Node transforms, skeleton hierarchy, inverse binds, vertex positions, normals, UVs, joint indices, weights and triangle topology are unchanged. Only the small eyebrow and eye albedos are embedded; no external resources or decoder extensions are required. Source hair/eye normal-image URI typos are immaterial because those normal maps are omitted. The main body base color, normal and roughness maps are also omitted: the integrated main body uses continuous bone-weight palette vertex colors and an authored shared material. Removing these unused images saves 425,640 bytes without changing the rendered body material or any geometry.

| Original image | Original bytes | Original SHA-256 | Embedded derivative | Derivative bytes |
| --- | ---: | --- | --- | ---: |
| `T_Hair_1_BaseColor.png` | 1,570,376 | `bc7aa863bd22ab0a995cd838cceb4d3a5186ee54ee2fb0108fad85d20c057e6e` | 256×256 JPEG quality 88 | 14,625 |
| `T_Eye_Brown.png` | 35,958 | `d08e3356a83211bc6ca21fe3a8e39f4b5c1a3b8f85457fc2c0fb57be09935025` | 256×256 PNG | 32,367 |

JPEG derivatives use Pillow 12.1.1 Lanczos resizing, optimized JPEG with 4:4:4 color sampling; the eye image remains optimized PNG with alpha. No body mesh simplification, skin-weight quantization, normal recomputation or bind recalculation was performed. These are generic human bodies with original fitted football gear supplied by the application, not scanned likenesses or the actual players' measured bodies.

Exact major bone chain names are `root → pelvis → spine_01 → spine_02 → spine_03 → neck_01 → Head`; arms are `clavicle_l/r → upperarm_l/r → lowerarm_l/r → hand_l/r`; legs are `thigh_l/r → calf_l/r → foot_l/r → ball_l/r → ball_leaf_l/r`. Imported rest rotations are nontrivial and are preserved; fitting and posing must respect the bind frame.

### Four motion clips, without another mannequin

Source `Unreal-Godot/UAL1_Standard.glb` is 7,618,436 bytes, SHA-256 `69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997`, and contains 43 clips. The selected runtime derivative is:

- `/film-room/art/quaternius-football-motion.glb`
- **289,512 bytes**, SHA-256 `ae30083012c9d27d0cb07559ba75de2db6ffe5755730f79642650dd7d7b79e36`.
- `Idle_Loop` (2.5 s), `Jog_Fwd_Loop` (0.9333333373 s), `Push_Loop` (2.6666667461 s) and `Sprint_Loop` (0.6666666865 s).
- 65 quaternion tracks per clip, 260 total. There are no meshes, materials, images or translation/scale animation tracks in this file.

The body and animation library use matching bone names but different local rest transforms. Selected quaternion keys are converted as `Q_bodyRest × inverse(Q_UALRest) × Q_clipLocal`, normalized and kept sign-continuous. Original clip time samples and linear quaternion interpolation are retained. The motion GLB uses the body's exact node names and rest hierarchy. Runtime consumers must **not apply this rest correction a second time**. The application's authored root path and final hand/ankle constraints remain the motion owners; these clips provide secondary body detail rather than another root-motion clock.

The free pack has no verified football-specific throw, catch, block, rush or backpedal clip. Using generic locomotion/push motion for football is an **authored adaptation**, not recovered game technique or motion capture of this play. Unused clips and the full mannequin/animation archive are not shipped.

### Packaging verification and limits

The installed Three.js 0.186.1 GLTFLoader parsed the body hierarchy/geometry/skin and all four motion clips in a CPU-only check. All motion track names resolve to the body bone names. SkeletonUtils clones were verified to have independent skeletons with shared geometry. Loaded weight sums differ from one by at most `4.85e-8`. The Node check used a temporary untextured material view because Node has no browser image decoder; every embedded image was decoded separately with Pillow. Structural checks compare original and runtime nodes/skins/meshes/accessors and the original binary prefix. This verifies packaging, not final rendering, garment fit or game authenticity.

Body and selected motion total **1,078,728 bytes** (about 1.03 MiB), versus the unused source archives. Together with both grass maps, the runtime art payload is **1,507,982 bytes**, excluding the small license text. The optional 1.44 MB HDRI remains outside Git.

Reproduction/audit files are outside Git under `/tmp/ajetsfan-quaternius-assets/`: `package-runtime.py`, `validate-runtime.mjs`, `runtime-packaging.json`, the acquisition `provenance.json`, `body-inspection.json` and the original Standard licenses. The packaging manifest records every selected source/derived image hash and the complete local-rest quaternion correction map.
