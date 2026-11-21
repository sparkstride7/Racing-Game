CAR DESIGN FOLDER
Racing Game project - preserved car designs
Created 20 November 2026 (EXOTIC_v10b added later the same day;
Proto Corsa-OG and Proto Corsa-90GT added 21 November 2026)

This folder keeps eight car designs from the Racing Game's development history,
each in its own folder, so they can be opened, studied or reused later.
(Proto Corsa-OG and Proto Corsa-90GT are inside V2-GT-Racecar/Test-V2-GT.)

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
  V4-GT-Racecar 57 (24 of these are the shared On-Circuit pictures),
  EXOTIC_v10b 21, V10c 20, Proto Corsa-OG 30, Proto Corsa-90GT 18.


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
EXOTIC_v10b/   Exotic v10b
----------------------------------------------------------------------
Version:   exotic-v10b (18 November 2026), v10 with a reshaped front wing.
           It came before V10c.
Source:    Built by the build scripts in Source-Code (final model saved on
           18 November at 19:51:27)
GitHub:    Added to this folder on 20 November 2026.
Details:   EXOTIC_v10b has its own README.txt and CHECKSUMS-SHA256.txt.

Model/original_exotic_supercar_v10_source.glb
           The full-detail 3D model. Its name says "v10" because every v10
           version used the same file name; this is the v10b file. It is a
           different file from the one in V10c.
Optimised-LOD-Files/optimized_exotic_supercar_v10bopt_LOD0/1/2.glb
           the same car in three levels of detail
Source-Code/   build4.ts, designs4.ts, parts.ts, geo.ts, main.ts, index.html,
               vite.config.mjs, shoot0.cjs, build.log

Preview-Images/  21 original images
  Studio view, 11 views and close-ups on Greenfield Circuit, front / front
  three-quarter / side views (plus the same with each part coloured), the
  v10 vs v10b and v10b vs v10c comparisons, and one second render in
  Second-Render-For-v10c-Comparison. No colour variations were made.


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
V2-GT-Racecar/Test-V2-GT/Proto Corsa-OG/   Proto Corsa-OG
----------------------------------------------------------------------
Version:   Proto Corsa-OG (20 November 2026), the V2 GT racecar redesigned
           in the Test-V2-GT area. It is Revision 4 of the "Fenders and
           Quarter Panels" version (Revision 4: Rounded Splitter Corners).
Design:    Starting from the original V2 GT:
           - a diamond-mesh grille;
           - front fenders and rear quarter panels with wheel arches and
             wheel-well liners;
           - smoothed fenders with a hip line over each wheel;
           - lower body-coloured rocker panels with carbon blades;
           - lower front and rear bumpers (the splitter and diffuser moved
             down with them);
           - rounded front splitter corners.
Source:    Copied unchanged from the work area folder
           Test-V2-GT/Fenders-and-Quarter-Panels-Version/
           Revision-4-Rounded-Splitter-Corners (40 files).
           One note was added: ABOUT-PROTO-CORSA-OG.txt.
GitHub:    Added to this folder on 21 November 2026.
Details:   Proto Corsa-OG has its own README.txt, which gives every change
           and test result, and ABOUT-PROTO-CORSA-OG.txt.

Model/gt_racecar_v2_fenders_rev4.glb   the 3D model (23,524 triangles)
Source-Code/   build_fenders_rev4.mjs (builds the model from the
               diamond-grille V2 GT design), the checks
               check_wheel_clearance.mjs, check_suspension_travel.mjs,
               check_ground_clearance.mjs, check_bodywork.mjs,
               render_previews.ts, make_before_after.py, package.json

Preview-Images/  30 images made during development (20 November)
  gt_racecar_v2_fenders_rev4-*.png   20 views: front, rear, side, top, low
                                     angles, four three-quarter views and
                                     close-ups (splitter corners, bumpers,
                                     fenders, rocker panels, steered wheels)
  before-after-*.png                 10 comparisons: Revision 3 (left) and
                                     this design (right)


----------------------------------------------------------------------
V2-GT-Racecar/Test-V2-GT/Proto Corsa-90GT/   Proto Corsa-90GT
----------------------------------------------------------------------
Version:   Proto Corsa-90GT (21 November 2026): Proto Corsa-OG with a new
           front grille modelled on your reference photograph.
Design:    The diamond mesh and thin chrome border are replaced by 45
           straight, evenly spaced vertical polished-chrome bars in front of
           the near-black grille recess, inside a substantial rounded chrome
           surround that follows the Proto Corsa-OG grille opening.
           Everything else is exactly as in Proto Corsa-OG.
Source:    Copied unchanged from the work area folder
           Test-V2-GT/Proto Corsa-90GT (36 files).
GitHub:    Added to this folder on 21 November 2026.
Details:   Proto Corsa-90GT has its own README.txt, which gives every change
           and test result.

Model/proto_corsa_90gt.glb   the 3D model (19,852 triangles)
Source-Code/   build_proto_corsa_90gt.mjs (builds the model from the Proto
               Corsa-OG model), the checks check_grille_fit.mjs,
               check_bodywork.mjs, check_ground_clearance.mjs,
               check_wheel_clearance.mjs, render_previews.ts,
               make_before_after.py, package.json
Validation/    the saved results of every check (validator, three.js
               render, grille fit, bodywork, ground and wheel clearance,
               parts compared with Proto Corsa-OG, build report)

Preview-Images/  18 images made during development (21 November)
  proto_corsa_90gt-*.png      11 views: front, front low angle, side, three
                              three-quarter views and five grille close-ups
  before-after-*.png          6 comparisons: Proto Corsa-OG (left) and this
                              design (right)
  reference-photo-vs-proto-corsa-90gt-grille.png
                              your reference photograph beside the new grille


----------------------------------------------------------------------
CHECKSUMS-SHA256.txt lists a fingerprint for every file in this folder except
this README and the list itself, so you can check later that nothing has
changed.
