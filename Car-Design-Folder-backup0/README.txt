CAR DESIGN FOLDER
Racing Game project - preserved car designs
Created 20 November 2026

This folder keeps five car designs from the Racing Game's development history,
each in its own folder, so they can be opened, studied or reused later.

All files are unchanged copies. The originals were left exactly where they were.
Original filenames are kept (the one exception is the V2 file, see below).

How to open the 3D model files (.glb)
  .glb files are standard 3D files. They open in most 3D tools and viewers,
  for example Blender (File > Import > glTF 2.0), the Windows 3D Viewer,
  or https://gltf-viewer.donmccurdy.com in a web browser.
  Each .glb file contains everything it needs inside it: shapes, colours,
  materials and its small texture images are all stored inside the file.
  There are no separate texture files to keep track of.
  The files in "Optimised-LOD-Files" are compressed with Meshopt. The web
  viewer above opens them; some other tools may not. If a tool cannot open
  them, use the full-detail file in "Model" instead.

About the preview images
  Every image in the Preview-Images folders is an original image made during
  development. No new renders were added.
  Original preview images found: V1 9, V2-GT-Racecar 4, V4-Exotic 57,
  V4-GT-Racecar 57 (24 of these are the shared On-Circuit pictures), V10c 20.


----------------------------------------------------------------------
V1/   Original car from the First Playable Build
----------------------------------------------------------------------
Version:   V1, the first playable build (10 November 2026)
GitHub:    backup/first-playable-build, commit 7771ff3, tag v1.0-first-playable
Type:      Built entirely in code. There is no 3D model file for this car.

Source-Code/  the original files, copied unchanged from commit 7771ff3
  src/vehicle/CarModel.ts   the car itself: body, cabin, wing, lights, wheels
  src/vehicle/Car.ts        how the car sits on its wheels and drives
  src/config.ts             the car's sizes (wheel size and positions)
  package.json              the library versions used (three.js 0.187)

Preview-Images/  9 original images
  Screenshots from the game taken on 17 November while the Greenfield Circuit
  was being built. The car code was unchanged from the First Playable Build at
  that time, so these show the original V1 car.
  t0-start.png             start screen, car seen from the side
  t1-grid.png              rear view from the chase camera on the grid
  t-0.12.png ... t-0.9.png rear views at points around the circuit
  rev-1.png, rev-2.png     rear views on the circuit
  No studio previews (front, top, colour variations) were made at the time.


----------------------------------------------------------------------
V2-GT-Racecar/   V2 GT racecar
----------------------------------------------------------------------
Version:   v2 GT racecar (17 November 2026)
Source:    Your own uploaded file, original_gt_racecar_v2.glb.
           Copied from the upload, unchanged. The upload system had added a
           short code to the front of the name, which has been removed.
GitHub:    Not on GitHub.

Model/original_gt_racecar_v2.glb       the 3D model
Supporting-Files/gt.tree.txt           list of the parts inside the model
                                       (written when the file was inspected)

Preview-Images/  4 original images (17 November, 20:10 and 20:23)
  gt-rest.png             front three-quarter, rear three-quarter, side,
                          chase camera
  gt-steer.png            front wheels steered and wheels rolled
  gt-lineup.png           the six colour variations
  compare-v1-v2-v3.png    comparison image: v1 test car, v2 GT (this car),
                          v3 GT, v3 Exotic


----------------------------------------------------------------------
V4-Exotic/   V4 Exotic supercar
V4-GT-Racecar/   V4 GT racecar
----------------------------------------------------------------------
Version:   v4 (17 November 2026), the first full-detail pair of 3D cars
Source:    Built by the build scripts in Source-Code (both v4 cars come from
           the same scripts, so each folder has its own copy)
GitHub:    Not on GitHub.

Model/original_<car>_v4.glb                     the full-detail 3D model
Optimised-LOD-Files/optimized_<car>_v4_LOD0/1/2.glb
                                                the same car in three levels
                                                of detail (near, middle, far),
                                                made from the model above
Source-Code/   build4.ts, designs4.ts, parts.ts, geo.ts (the car's design
               and how it is built), main.ts, index.html, vite.config.mjs,
               shoot.cjs (the page that builds and saves the file).
               Needs the three.js library to run.

Preview-Images/  original images (17 November, 20:30 to 21:28)
  original_<car>_v4-studio.png        studio view made when the file was built
  original_<car>_v4-views.png         front three-quarter, rear three-quarter,
                                      side, chase camera
  original_<car>_v4-steered.png       front wheels steered
  original_<car>_v4-six-colours.png   the six colour variations
  six_colours_<car>_LOD0.png          six colours, optimised file
  compare_closeup_<car>.png           original vs the three detail levels
  compare_distance_<car>.png          the detail levels at distance
  steering_test_<car>_LOD2.png        steering check
  both_cars_side_by_side.png          comparison: both v4 cars
  compare-v3-v4.png                   comparison: v3 vs v4
  *-d10.png ... *-d90.png             detail-level tests at 10 to 90 metres
  On-Circuit-Both-V4-Cars/            the v4 cars on Greenfield Circuit in all
                                      six colours, from the front, side, rear
                                      and above. Each picture shows BOTH v4
                                      cars, so the same pictures are in both
                                      V4 folders.


----------------------------------------------------------------------
V10c/   Exotic v10c
----------------------------------------------------------------------
Version:   exotic-v10c (18 November 2026), the front-end refinement of v10,
           which was rebuilt from your technical drawing
Source:    Built by the build scripts in Source-Code
GitHub:    Not on GitHub.

Model/original_exotic_supercar_v10_source.glb
           The full-detail 3D model. Its name says "v10" because every v10
           version used the same file name. This copy is the one built in the
           v10c folder on 18 November at 20:03:44 (see Source-Code/build.log).
Optimised-LOD-Files/optimized_exotic_supercar_v10copt_LOD0/1/2.glb
           the same car in three levels of detail
Source-Code/   build4.ts, designs4.ts, parts.ts, geo.ts, main.ts, index.html,
               vite.config.mjs, shoot0.cjs, build.log
               Needs the three.js library to run. Your reference drawing that
               v10 was measured from is not included (it shows a different car).

Preview-Images/  original images (18 November, 20:03 to 21:43)
  original_exotic_supercar_v10-studio.png  studio view made when built
  exotic-v10c-front / -frontLeft / -frontRight / -side / -sideFront /
  -rear / -top .png                        views on Greenfield Circuit
  exotic-v10c-archLeft / -archRight / -bonnet / -intake .png
                                           close-ups
  v10c-src-You-front / -front34 / -sideFull .png
                                           front, front three-quarter, side
  v10c-src-debug-*.png                     the same views with each part
                                           shown in a different colour
  EXOTIC_v10b_vs_v10c.png                  comparison: v10b vs v10c
  EXOTIC_v10c_vs_v10dd.png                 comparison: v10c vs v10dd
  No colour variations were made for v10c (it was only shown in red).


----------------------------------------------------------------------
CHECKSUMS-SHA256.txt lists a fingerprint for every file in this folder, so
you can check later that nothing has changed.
