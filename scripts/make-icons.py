from pathlib import Path
from PIL import Image, ImageDraw

folder = Path(__file__).resolve().parents[1] / 'extension' / 'icons'
folder.mkdir(exist_ok=True)
image = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
d = ImageDraw.Draw(image)
d.rounded_rectangle((0, 0, 511, 511), radius=116, fill='#2d503e')
# A tape-measure monogram, made locally with simple geometric strokes.
d.line([(104, 350), (104, 187), (172, 187), (251, 285), (330, 187), (398, 187), (398, 350)], fill='#f4f5e7', width=36, joint='curve')
for x in (132, 175, 218, 261, 304, 347, 390):
    d.line([(x, 402), (x, 383 if x % 2 else 373)], fill='#d9ad78', width=9)
for size in (16, 32, 48, 128):
    image.resize((size, size), Image.Resampling.LANCZOS).save(folder / f'{size}.png')
