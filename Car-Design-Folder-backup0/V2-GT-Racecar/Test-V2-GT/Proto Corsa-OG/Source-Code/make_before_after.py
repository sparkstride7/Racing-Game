# Puts each 'before' (revision 3) and 'after' (revision 4) render side by side with labels (Python 3 + Pillow).
#   python3 make_before_after.py <output folder>   (reads the renders from ./out)
import sys, os
from PIL import Image, ImageDraw, ImageFont
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 34)
except Exception: font = ImageFont.load_default()
for name in ['front', 'front-low-angle', 'side', 'top', 'front-left-three-quarter', 'front-right-three-quarter', 'closeup-front-bumper', 'closeup-splitter-corner-right-side', 'closeup-splitter-corner-left-side', 'closeup-splitter-corner-from-above']:
    a = Image.open(f'out/before__{name}.png').convert('RGB'); b = Image.open(f'out/new__{name}.png').convert('RGB')
    w, h = a.size; c = Image.new('RGB', (w * 2 + 12, h + 64), (40, 44, 52)); c.paste(a, (0, 64)); c.paste(b, (w + 12, 64))
    d = ImageDraw.Draw(c)
    d.text((24, 14), 'BEFORE: Revision 3', fill=(235, 235, 235), font=font)
    d.text((w + 36, 14), 'AFTER: Revision 4 (rounded splitter corners)', fill=(235, 235, 235), font=font)
    c.save(f'{out}/before-after-{name}.png', optimize=True)
