#!/usr/bin/env python3
"""Build a self-contained RELIQ app with the Python standard library."""
import argparse,base64,hashlib,json,re
from pathlib import Path
from versioning import stamp
ROOT=Path(__file__).resolve().parents[1]
SRC,DOCS=ROOT/'src',ROOT/'docs'
def uri(name):return 'data:image/png;base64,'+base64.b64encode((DOCS/'assets'/name).read_bytes()).decode()
def js(value):return json.dumps(value,ensure_ascii=False).replace('<','\\u003c')
def build(export=None):
    icon_names=['icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png','mark-96.png','favicon-32.png']
    icon_version=hashlib.sha256(b''.join((DOCS/'assets'/name).read_bytes() for name in icon_names)).hexdigest()[:12]
    manifest=json.loads((DOCS/'site.webmanifest').read_text())
    for icon in manifest['icons']:icon['src']=icon['src'].split('?')[0]+'?v='+icon_version
    (DOCS/'site.webmanifest').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    content=json.loads((ROOT/'content.json').read_text());sources=json.loads((ROOT/'sources.json').read_text())
    objects={o['id'] for o in content['objects']};assert len(objects)==len(content['objects'])==7
    cards=content['cards'];assert len({c['id'] for c in cards})==len(cards)==28
    for o in content['objects']:
        assert all(s in sources for s in o['sources']);assert set(o['related'])<=objects
        for h in o['hypotheses']:assert all(s in sources for s in h['sources'])
    for c in cards:assert c['topic'] in objects and set(c['related'])<=objects and all(s in sources for s in c['sources']) and c['kind'] in ['fact','link','case']
    assets={o['id']:(DOCS/'assets'/(o['id']+'.svg')).read_text() for o in content['objects']}
    for id,svg in assets.items():
        assert 'data-layer="object"' in svg and 'data-layer="detail"' in svg,id
        ids=re.findall(r'\bid="([^"]+)"',svg);assert len(ids)==len(set(ids)),id
    parts={'/*__CSS__*/':'\n'.join((SRC/name).read_text() for name in ['style.css','updater.css']), '__ICON__':uri('mark-96.png'), '<!--__QR__-->':(DOCS/'assets/qr.svg').read_text(), '/*__DATA__*/':'const CONTENT='+js(content)+';\nconst SOURCES='+js(sources)+';\nconst ASSETS='+js(assets)+';', '/*__LEARNING__*/':(SRC/'learning.js').read_text(),'/*__APP__*/':(SRC/'app.js').read_text(),'/*__UPDATER__*/':(SRC/'updater.js').read_text()}
    html=(SRC/'shell.html').read_text().replace('__ICON_VERSION__',icon_version)
    for key,value in parts.items():assert key in html,key;html=html.replace(key,value)
    html=stamp(html,'reliq',DOCS);assert '/*__' not in html and '<!--__' not in html
    (DOCS/'index.html').write_text(html)
    offline=html.replace('<link rel="manifest" href="site.webmanifest?v='+icon_version+'">','')
    for name in ['favicon-32.png','apple-touch-icon.png']:offline=offline.replace('href="assets/'+name+'?v='+icon_version+'"','href="'+uri(name)+'"')
    offline=offline.replace('<a class="secondary-button" href="RELIQ.html" download>Скачать офлайн-версию ↓</a>','<p>Открыта автономная копия приложения.</p>')
    (DOCS/'RELIQ.html').write_text(offline);(DOCS/'.nojekyll').touch()
    if export:export.mkdir(parents=True,exist_ok=True);(export/'RELIQ.html').write_text(offline)
    print(f'Built {len(html.encode()):,} bytes; 7 objects; {len(cards)} cards; {len(sources)} sources.')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--export',type=Path);build(p.parse_args().export)
