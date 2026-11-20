EXOTIC_v10b
Racing Game project - preserved car design
Added 20 November 2026

Version:   exotic-v10b (18 November 2026)
           v10 was a full rebuild of the Exotic from your technical drawing.
           v10b reshaped its front wing. It was followed by v10c and then
           v10dd, the car used in the game today.
GitHub:    Not on GitHub before this folder was added.
Source:    Built by the build scripts in Source-Code, in the exotic-v10b
           build folder. The final model was saved on 18 November at 19:51:27.

All files are unchanged copies with their original filenames. The originals
were left exactly where they were.


Model/  (1 file)
  original_exotic_supercar_v10_source.glb
      The full-detail 3D model. Its name says "v10" because every v10
      version used the same file name. This is the v10b file
      (see Source-Code/build.log). It is a different file from the one in
      the V10c folder, even though the names are the same.

Optimised-LOD-Files/  (3 files)
  optimized_exotic_supercar_v10bopt_LOD0.glb, _LOD1.glb, _LOD2.glb
      The same car in three levels of detail (near, middle, far), made from
      the model above. Compressed with Meshopt: the web viewer at
      https://gltf-viewer.donmccurdy.com opens them. If a tool cannot open
      them, use the full-detail file in Model instead.

  Every .glb file contains everything it needs: shapes, colours, materials
  and its small texture images are stored inside the file.

Source-Code/  (9 files)
  build4.ts, designs4.ts, parts.ts, geo.ts   the car's design and how it is built
  main.ts, index.html, vite.config.mjs,
  shoot0.cjs                                 the page that builds and saves it
  build.log                                  the record of the build
  Needs the three.js library to run.

Preview-Images/  (21 original images, no new renders)
  original_exotic_supercar_v10-studio.png  studio view made when the file
                                           was built (19:51)
  exotic-v10b-front / -frontLeft / -frontRight / -side / -sideFront /
  -rear / -top .png                        views on Greenfield Circuit (19:52)
  exotic-v10b-archLeft / -archRight / -bonnet / -intake .png
                                           close-ups (19:52)
  v10b-src-You-front / -front34 / -sideFull .png
                                           front, front three-quarter, side,
                                           made from this exact model (20:03)
  v10b-src-debug-front / -front34 / -sideFull .png
                                           the same views with each part
                                           shown in a different colour
  EXOTIC_v10_vs_v10b.png                   comparison: v10 vs v10b (sent to you
                                           on 18 November at 19:52)
  EXOTIC_v10b_vs_v10c.png                  comparison: v10b vs v10c (20:04)
  Second-Render-For-v10c-Comparison/exotic-v10b-frontLeft.png
      The circuit views were drawn again at 20:04 for the v10c comparison.
      Ten of those were exactly the same as the first set, so only this one,
      which came out very slightly different, is kept here.

  Not included: 12 images in an older folder (front-lab/v10b, 19:31). They
  were made 20 minutes before the final v10b existed, so they show an
  earlier attempt, not this design.
  No colour variations were made for v10b (it was only shown in red).

CHECKSUMS-SHA256.txt lists a fingerprint for every other file in this folder.
