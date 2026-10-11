"""Embed a content-based release ID and write the static update manifest."""
import hashlib
import json
from datetime import datetime, timezone

def stamp(html, app, docs):
    digest=hashlib.sha256(html.encode())
    for p in sorted((docs/'assets').glob('*')):
        if p.is_file():digest.update(p.name.encode());digest.update(p.read_bytes())
    version='r-'+digest.hexdigest()[:20]
    previous={}
    try:previous=json.loads((docs/'version.json').read_text())
    except (FileNotFoundError,ValueError):pass
    built=previous.get('builtAt') if previous.get('version')==version else None
    built=built or datetime.now(timezone.utc).isoformat(timespec='seconds')
    (docs/'version.json').write_text(json.dumps({'app':app,'version':version,'builtAt':built},ensure_ascii=False,indent=2)+'\n')
    return html.replace('__APP_RELEASE__',version).replace('__APP_BUILT__',built)
