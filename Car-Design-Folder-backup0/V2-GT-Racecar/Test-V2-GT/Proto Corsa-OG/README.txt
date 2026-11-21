V2 GT RACECAR: FENDERS AND QUARTER PANELS, REVISION 4
Rounded front splitter corners
Test design, made 20 November 2026, for review (not approved yet)

What it is
  Revision 3 (lower rockers and bumpers; in
  ../Revision-3-Lowered-Bumpers-and-Rockers) with one more change: the two
  exposed front outer corners of the front splitter are rounded.
  - It is built from the approved diamond-mesh grille design
    (../../Model/gt_racecar_v2_diamond_grille.glb) with the Revision 3 source
    code plus this one change.
  - Revisions 1, 2 and 3 and the diamond-grille design were only read, never
    changed.

The change (compared with Revision 3)
  Front splitter, front outer corners (both sides, matching)
    - Each corner, where the splitter's front edge meets its side edge, was a
      sharp 90 degree corner. Seen from above, it is now a smooth circular
      curve with an 18 cm radius.
    - The curve runs smoothly (tangentially) into the straight front edge and
      the straight side edge, so there is no step or kink where it starts or
      ends.
    - The curved edge is shaded smoothly, so it reads as one curved surface.
      The top and bottom stay flat, and the edges between them and the curved
      side stay crisp, like the rest of the splitter.
    - The two rear corners, by the front wheels, are unchanged (still square).
    - Kept exactly as in Revision 3:
      - thickness 5.5 cm
      - height (bottom 29.75 cm, top 35.25 cm above the ground)
      - full width 2.0 m
      - depth 55 cm
      - position
      - material (Carbon_Fibre)
      The splitter was not shortened, narrowed, moved or otherwise redesigned:
      only the two corners were cut back to the curve.
    - The setting is SPLITTER_CORNER_RADIUS at the top of the build script.

  Nothing else changed:
  - The body and all other 75 parts are identical to Revision 3 (shape,
    position and material). That includes the front bumper, grille,
    headlights, canards, rocker panels, rear bumper, diffuser and wheels.
  - All 14 materials are unchanged.
  - Length (4.685 m), height (1.500 m) and overall width (2.477 m) are
    unchanged.

Files
  Model/gt_racecar_v2_fenders_rev4.glb
      The new 3D model. Self-contained (everything is inside the file).
      Opens in Blender (File > Import > glTF 2.0) or https://gltf-viewer.donmccurdy.com
      23,524 triangles (Revision 3: 23,328; the splitter went from 12 to 208
      triangles for the smooth curves), 791 KB.

  Source-Code/
      build_fenders_rev4.mjs       builds this model from the diamond-grille
                                   model (Revision 3 plus the rounded corners)
      check_wheel_clearance.mjs    wheels spun a full turn, front wheels
                                   steered full left to full right
      check_suspension_travel.mjs  how far each wheel can move up before
                                   touching anything
      check_ground_clearance.mjs   lowest parts, approach, departure and ramp
                                   angles, body tipped
      check_bodywork.mjs           gaps in the body and parts cutting
                                   through it
      render_previews.ts           draws the preview images (three.js 0.187)
      make_before_after.py         puts the before and after images side by side
      package.json                 libraries: @gltf-transform/core 4.5.1,
                                   cdt2d 1.0.0
      To run again: in Source-Code, "npm install", then "npm run build",
      "npm run check-wheels", "npm run check-suspension",
      "npm run check-bodywork", "npm run check-ground".

  Preview-Images/  (all drawn from the .glb files themselves)
      gt_racecar_v2_fenders_rev4-front / -front-low-angle / -rear / -side
      / -side-low-angle / -top
      ...-front-left-three-quarter / -front-right-three-quarter
      ...-rear-left-three-quarter / -rear-right-three-quarter
      ...-closeup-splitter-corner-right-side / -closeup-splitter-corner-left-side
      / -closeup-splitter-corner-from-above
      ...-closeup-front-bumper / -closeup-rear-bumper / -closeup-front-fender
      / -closeup-rear-quarter-panel / -closeup-rocker-panel
      / -closeup-rocker-panel-low-angle
      / -closeup-front-fender-wheels-steered-35deg
      before-after-front / -front-low-angle / -side / -top
      / -front-left-three-quarter / -front-right-three-quarter
      / -closeup-front-bumper / -closeup-splitter-corner-right-side
      / -closeup-splitter-corner-left-side / -closeup-splitter-corner-from-above
          (Revision 3 on the left, Revision 4 on the right)

Checks done (Revision 3 figures in brackets)
  - glTF validator: 0 errors, 0 warnings, 0 notes.
  - Opens and renders in three.js.
  - Building again from the source code gives a byte-for-byte identical model.
  - Parts compared with Revision 3: only Front_Splitter differs. The body
    and the other 75 parts are identical.
  - The new splitter is a properly closed solid:
    - every edge is shared by exactly two triangles, and nothing is inside
      out;
    - its volume (59.7 litres) is exactly what the rounded shape should have;
    - its outer limits are the same as before (2.0 m by 55 cm by 5.5 cm).
  - Wheels: no contact anywhere.
    - Every wheel was spun through a full turn, and the front wheels were
      steered 40 degrees each way in 5 degree steps.
    - Smallest gap 14.4 mm front (14.4) and 23.8 mm rear (23.8). Both are
      bodywork, not the splitter.
    - The rounded corners are more than half a metre ahead of the front
      tyres.
  - Suspension travel: 16 mm front (16), 22 mm rear (22).
  - Ground clearance: nothing below the ground.
    - The splitter's lowest point is 29.75 cm above the ground (29.75).
    - Lowest part overall: the rocker blades at 26.85 cm (26.85).
    - Approach angle 15.5 degrees (15.5), departure angle 15.5 degrees
      (15.5), ramp angle 23.3 degrees (23.3).
    - With the body tipped, the lowest point is 19.9 cm or more (19.9).
  - Body: closed shell, no gaps. The parts cutting through the body are the
    same as Revision 3.
    - The splitter's count shows 5 instead of 4. That is only because its
      flat top is now made of more, smaller triangles where it meets the
      underside of the bumper, which is the same contact as in Revision 3.
    - I checked each of those triangles: none is on the new rounded
      corners.
  - Revisions 1, 2 and 3, the diamond-grille model and the original V2 GT
    model are byte-for-byte unchanged.
