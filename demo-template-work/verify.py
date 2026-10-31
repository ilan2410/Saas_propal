import zipfile,re
from pathlib import Path
from lxml import etree as E
p=Path('proposition-commerciale-demo-novalis.docx');z=zipfile.ZipFile(p)
print('ZIP integrity:',z.testzip())
for n in z.namelist():
 if n.endswith('.xml') or n.endswith('.rels'):
  b=z.read(n)
  E.fromstring(b)
  s=b.decode('utf-8',errors='replace')
  for match in re.finditer(r'e.mag|chanoux|lumi[eè]re|93330|802492272|e-magnumerique',s,re.I):print('Residual:',n,s[max(0,match.start()-50):match.end()+70])
print('Size:',p.stat().st_size)
