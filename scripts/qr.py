"""Regenerate a QR with a four-module quiet zone. Requires ReportLab and Pillow."""
from pathlib import Path
from reportlab.graphics.barcode import qrencoder
from PIL import Image, ImageDraw

assets=Path(__file__).resolve().parents[1]/'docs/assets'
url='https://evgk724.github.io/reliq-atlas/'
qr=qrencoder.QRCode(None,qrencoder.QRErrorCorrectLevel.M);qr.addData(url);qr.make()
n=qr.getModuleCount();quiet=4;size=n+quiet*2
path=''.join(f'M{x+quiet} {y+quiet}h1v1h-1z' for y in range(n) for x in range(n) if qr.isDark(y,x))
svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" role="img" aria-label="QR-код приложения RELIQ" shape-rendering="crispEdges"><title>RELIQ — {url}</title><rect width="{size}" height="{size}" fill="#ffffff"/><path d="{path}" fill="#081614"/></svg>'
(assets/'qr.svg').write_text(svg)
im=Image.new('RGB',(size*16,size*16),'white');draw=ImageDraw.Draw(im)
for y in range(n):
    for x in range(n):
        if qr.isDark(y,x):draw.rectangle(((x+quiet)*16,(y+quiet)*16,(x+quiet+1)*16-1,(y+quiet+1)*16-1),fill='#081614')
im.save(assets/'qr.png')
print(f'QR: {n} modules, {url}')
