# Puts each 'before' (Proto Corsa-OG) and 'after' (Proto Corsa-90GT) render side by side with labels (Python 3 + Pillow).
#   python3 make_before_after.py <output folder>   (reads the renders from ./out)
import sys, os
from PIL import Image, ImageDraw, ImageFont
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 34)
except Exception: font = ImageFont.load_default()
for name in ['front', 'front-left-three-quarter', 'front-right-three-quarter', 'closeup-grille-front', 'closeup-grille-three-quarter-left', 'closeup-grille-corner-detail']:
    a = Image.open(f'out/before__{name}.png').convert('RGB'); b = Image.open(f'out/new__{name}.png').convert('RGB')
    w, h = a.size; c = Image.new('RGB', (w * 2 + 12, h + 64), (40, 44, 52)); c.paste(a, (0, 64)); c.paste(b, (w + 12, 64))
    d = ImageDraw.Draw(c)
    d.text((24, 14), 'BEFORE: Proto Corsa-OG (diamond mesh)', fill=(235, 235, 235), font=font)
    d.text((w + 36, 14), 'AFTER: Proto Corsa-90GT (vertical chrome bars)', fill=(235, 235, 235), font=font)
    c.save(f'{out}/before-after-{name}.png', optimize=True)

# The reference photograph beside the straight-on grille close-up (when a photograph path is given).
if len(sys.argv) > 2:
    ref = Image.open(sys.argv[2]).convert('RGB'); b = Image.open('out/new__closeup-grille-front.png').convert('RGB').crop((150, 300, 1450, 690))
    h = 520; ref = ref.resize((round(ref.width * h / ref.height), h)); b = b.resize((round(b.width * h / b.height), h))
    c = Image.new('RGB', (ref.width + b.width + 12, h + 64), (40, 44, 52)); c.paste(ref, (0, 64)); c.paste(b, (ref.width + 12, 64))
    d = ImageDraw.Draw(c)
    d.text((24, 14), 'REFERENCE PHOTOGRAPH', fill=(235, 235, 235), font=font)
    d.text((ref.width + 36, 14), 'PROTO CORSA-90GT GRILLE', fill=(235, 235, 235), font=font)
    c.save(f'{out}/reference-photo-vs-proto-corsa-90gt-grille.png', optimize=True)
