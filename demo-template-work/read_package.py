import zipfile,lxml.etree as E,os
p=r'C:\Users\ilan\Downloads\proposition-commerciale-package.docx'
z=zipfile.ZipFile(p); ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
for n in z.namelist():
 if n.startswith('word/') and n.endswith('.xml'):
  root=E.fromstring(z.read(n)); texts=[''.join(e.itertext()) for e in root.findall('.//w:t',ns)]
  if texts: print('\nPART',n,'\n',' | '.join(texts))
 if n.startswith('word/media/'):
  out=os.path.join('demo-template-work',os.path.basename(n));open(out,'wb').write(z.read(n));print('MEDIA',n,len(z.read(n)))
