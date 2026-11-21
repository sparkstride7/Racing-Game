PROTO CORSA-90GT
Proto Corsa-OG with a vertical-bar chrome grille
Test design, made 21 November 2026, for review (not approved yet)

What it is
  Proto Corsa-90GT is the Proto Corsa-OG design (../Proto Corsa-OG) with a new
  front grille, modelled on your reference photograph: closely spaced vertical
  polished-chrome bars inside a substantial polished-chrome surround, in front
  of a dark recess.
  Proto Corsa-OG was only read, never changed.

What changed (compared with Proto Corsa-OG)
  Grille bars
    - The diamond mesh (2 parts) is replaced by 45 straight vertical chrome
      bars, one part named Front_Grille_Vertical_Bars.
      - Bars are evenly spaced, 3.03 cm apart (centre to centre), and all the
        same size: 1.2 cm wide and 1.6 cm deep.
      - Each bar is a solid rounded (oval) rod, so it catches the light like a
        real chrome grille bar.
    - The bars run from the top to the bottom of the grille opening, right out
      into its pointed side corners (where they get shorter).
      - Each bar end follows the edge of the opening and stops just short of
        it, hidden behind the surround's lip.
    - They sit 2 cm behind the front face, inside the black recess, with
      2.4 cm of dark space behind them.

  Chrome surround
    - The thin chrome border is replaced by a substantial polished-chrome
      surround (Front_Grille_Chrome_Surround).
      - It is a rounded trim about 6 cm wide: 4 cm on the front face plus a
        2 cm lip that turns into the opening.
      - It stands 3 cm proud of the front face.
    - It follows the outline of the Proto Corsa-OG grille opening exactly.
    - Like the old border, it is set a few millimetres into the flat front
      face, and its outer edge stays 5 mm inside the edges of that face.

  Materials
    - New material Grille_Polished_Chrome: bright silver, fully metallic and
      very smooth (roughness 0.05), used by the bars and the surround.
    - The old Grille_Chrome and Grille_Mesh_Silver materials were used only by
      the removed parts, so they were removed with them.

  Dark recess
    The black duct and back wall behind the grille (Grille_Recess_Black,
    almost black) are kept exactly as they were.

What did not change
  - Body shape, front and rear bumpers, rounded splitter corners, fenders and
    quarter panels, rocker panels, wheels, headlights, canopy, wing, mirrors
    and every other part: 73 of 76 parts are identical to Proto Corsa-OG.
  - The body is identical, triangle for triangle.
  - The other 12 materials are unchanged.
  - Length (4.685 m), height (1.500 m) and overall width (2.477 m) are
    unchanged. The surround stands out 3 cm, well behind the front of the
    splitter.

Compared with the reference photograph
  - Matched:
    - closely spaced, straight, evenly spaced vertical bars of the same
      thickness;
    - rounded, bright polished chrome;
    - a thick rounded chrome surround;
    - a near-black background.
  - Different, because the design keeps the Proto Corsa-OG grille opening, as
    asked:
    - In the photograph the grille's top edge arches up to a point in the
      middle and its bottom edge forms a shallow V.
    - Proto Corsa-90GT's opening has a flat top, a flat bottom and angled
      side corners.
    - In the photograph the top of the surround is a much deeper chrome band.
      Here there is only about 4.5 cm of flat face above the opening, so the
      surround is the same width all round.
  - Chrome needs something to reflect. The previews use a studio environment.
    In the game, chrome parts look this bright only if the game scene provides
    reflections (an environment map); otherwise they look darker grey.

Files
  Model/proto_corsa_90gt.glb
      The 3D model. Self-contained (everything is inside the file).
      Opens in Blender (File > Import > glTF 2.0) or https://gltf-viewer.donmccurdy.com
      19,852 triangles (Proto Corsa-OG: 23,524; the 45 bars use far fewer
      triangles than the diamond mesh did), 654 KB.

  Source-Code/
      build_proto_corsa_90gt.mjs  builds this model from the Proto Corsa-OG
                                  model. The grille settings (bar spacing,
                                  size and depth, surround width, lip, rise,
                                  chrome finish) are at the top.
      check_grille_fit.mjs        NEW: tests the bars and surround against
                                  every other part, and checks that the bars
                                  are inside the opening and the recess
      check_bodywork.mjs          gaps in the body and parts cutting through it
      check_ground_clearance.mjs  lowest parts and clearance angles
      check_wheel_clearance.mjs   wheels spun and steered
      render_previews.ts          draws the preview images (three.js 0.187)
      make_before_after.py        before/after and reference comparison images
      package.json                library: @gltf-transform/core 4.5.1
      To run again: in Source-Code, "npm install", then "npm run build",
      "npm run check-grille", "npm run check-bodywork", "npm run check-ground",
      "npm run check-wheels". The build reads ../../Proto Corsa-OG/Model/.

  Validation/   the saved results of every check below

  Preview-Images/  (all drawn from the .glb files themselves)
      proto_corsa_90gt-front / -front-low-angle / -side
      ...-front-left-three-quarter / -front-right-three-quarter
      ...-rear-left-three-quarter
      ...-closeup-grille-front / -closeup-grille-three-quarter-left
      / -closeup-grille-three-quarter-right / -closeup-grille-corner-detail
      / -closeup-grille-from-above
      before-after-front / -front-left-three-quarter / -front-right-three-quarter
      / -closeup-grille-front / -closeup-grille-three-quarter-left
      / -closeup-grille-corner-detail
          (Proto Corsa-OG on the left, Proto Corsa-90GT on the right)
      reference-photo-vs-proto-corsa-90gt-grille
          (your reference photograph beside the new grille)

Checks done
  - glTF validator: 0 errors, 0 warnings, 0 notes.
  - three.js: loads and renders with no errors (11 views).
  - Building again from the source code gives a byte-for-byte identical model.
  - Grille fit:
    - All 45 bars are inside the grille opening and inside the dark recess.
    - The bars cross no other part. Smallest gaps:
      - 1.5 mm to the opening's walls (hidden behind the surround's lip);
      - 8 mm to the surround;
      - 20 mm to the body's front face;
      - 24 mm to the recess back wall.
    - The surround crosses only the flat front face and the front rim of the
      black duct. That is because it is set into the face, as the old chrome
      border was.
    - It comes nowhere near the headlights or bonnet (more than 5 cm away),
      and its outer edge stays 5 mm inside the edges of the front face.
  - Body: closed shell, no gaps. The list of parts cutting through the body
    is the same as Proto Corsa-OG, except that the new surround (32
    triangles) takes the place of the old border (23).
  - Ground clearance and wheel clearance: exactly the same as Proto Corsa-OG.
    - Lowest part 26.85 cm.
    - No wheel contact with full steering. Smallest gaps 14.4 mm front and
      23.8 mm rear.
  - Proto Corsa-OG and all earlier revisions are byte-for-byte unchanged.
