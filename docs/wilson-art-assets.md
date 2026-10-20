# Wilson Film Room art assets

License and file verification: October 20, 2026. These are environmental art assets, not historical game evidence. They do not establish the appearance, weather or lighting of the actual Cleveland play.

Actually incorporated: the two Grass 005 WebP maps listed below. The player geometry, uniform/equipment artwork, crowd, stadium and generated daylight/reflection environment are original procedural work. No paid model, Quaternius body/animation pack or downloaded Poly Haven sky is incorporated in this revision.

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
