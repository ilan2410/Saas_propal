import zipfile,re,hashlib,json,io,os
from lxml import etree as E
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
base=Path(__file__).resolve().parent
src=Path(r'C:\Users\ilan\Downloads\proposition-commerciale-package.docx')
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'; ns={'w':W}
z=zipfile.ZipFile(src); parts={n:z.read(n) for n in z.namelist()}
inv={n:{'size':len(b),'sha256':hashlib.sha256(b).hexdigest()} for n,b in parts.items()}
(base/'inventory.json').write_text(json.dumps(inv,indent=2))
root=E.fromstring(parts['word/document.xml'])
sections=[E.tostring(s).decode() for s in root.findall('.//w:sectPr',ns)]
(base/'artifact.md').write_text('Reference: '+str(src)+'\nSHA256: '+hashlib.sha256(src.read_bytes()).hexdigest()+'\nRendering unavailable: bundled LibreOffice absent and Word unavailable.\nPreserve all package parts except branded text in word/document.xml and footer1.xml, media image1 image2 image5, core metadata. Keep all sections, typography, tables, drawings, numbering, relationships and exact variable tokens including split-run boundaries.\nSlots: all E-MAG variants -> NOVALIS; supplier address -> 24 avenue des Horizons 44000 Nantes; supplier phone email and legal IDs fictitious; introduction prose similar length. Cover and back cover replaced at exact original pixel dimensions, logo replacement same aspect ratio. Photos image3 and image4 preserved.\nSection evidence:\n'+'\n'.join(sections),encoding='utf-8')
replacements={
'E-MAG Numérique':'NOVALIS Télécom','E-MAG NUMÉRIQUE':'NOVALIS TÉLÉCOM','E-MAG NUMERIQUE':'NOVALIS TÉLÉCOM','E- MAG NUMERIQUE':'NOVALIS TÉLÉCOM',
'01 49 89 32 90':'01 99 00 00 42','technique@e-magnumerique.com':'assistance@novalis.example',
'Z.I DES CHANOUX, 79 RUE DES FRÈRES LUMIÈRE':'24 AVENUE DES HORIZONS','93330 NEUILLY-SUR-MARNE':'44000 NANTES',
'79 Rue des Frères Lumière, 93330 Neuilly-sur-Marne RCS Bobigny':'24 avenue des Horizons, 44000 Nantes RCS Nantes',
'Z.I Des Chanoux – 79 rue des Frères Lumière – 93330 NEUILLY SUR MARNE':'24 avenue des Horizons – 44000 NANTES',
'802 492 272 00025':'000 000 000 00000','FR72802492272':'FR00000000000','Bobigny':'Nantes',
'La technologie au service de votre entreprise':'Des communications adaptées à votre activité',
'Depuis 2014, E-MAG Numérique accompagne plus de 1 500 entreprises partout en France avec des solutions télécom pensées pour les professionnels.':'NOVALIS Télécom accompagne les entreprises dans leurs projets de téléphonie et de connectivité avec des solutions adaptées à leurs usages professionnels.',
'Notre équipe de 26 collaborateurs assure un service réactif (intervention moyenne sous 4 heures) et une proximité humaine que vous ne trouverez pas chez les grands opérateurs.':'Notre équipe privilégie un suivi attentif, une assistance accessible et des échanges directs pour vous accompagner au quotidien dans la gestion de vos communications.',
'Une connectivité sur-mesure, où que vous soyez':'Une connexion adaptée à chacun de vos sites',
'Une transition facilitée, des avantages concrets':'Un changement accompagné à chaque étape',
'Notre solution proposée':'Votre nouvelle solution télécom',
'Votre maintenance matérielle,':'Votre accompagnement technique,',
'un système tout inclus':'un service au quotidien',
}
def tokens(data):
 r=E.fromstring(data); text=''.join(r.xpath('//w:t/text()',namespaces=ns));return re.findall(r'\{\{.*?\}\}',text,re.S)
checks={};changes=[]
for name in ['word/document.xml','word/footer1.xml']:
 r=E.fromstring(parts[name]);before=tokens(parts[name]);count=0
 for p in r.findall('.//w:p',ns):
  nodes=p.findall('.//w:t',ns)
  # replace across runs while preserving all unaffected nodes and placeholders
  for old,new in sorted(replacements.items(),key=lambda x:-len(x[0])):
   whole=''.join(n.text or '' for n in nodes)
   starts=[m.start() for m in re.finditer(re.escape(old),whole)]
   for st in reversed(starts):
    end=st+len(old);pos=0; touched=[]
    for node in nodes:
     text=node.text or '';a=pos;b=pos+len(text);pos=b
     if a<end and b>st:touched.append((node,a,b,text))
    for i,(node,a,b,text) in enumerate(touched):
     left=text[:max(0,st-a)];right=text[max(0,end-a):] if end<b else ''
     node.text=left+(new if i==0 else '')+right
    count+=1
 parts[name]=E.tostring(r,xml_declaration=True,encoding='UTF-8',standalone=True)
 assert before==tokens(parts[name]),name+' VARIABLES CHANGED'
 checks[name]={'tokens':len(before),'preserved':True,'replacements':count}
# Deterministic vector-style logo and back cover, preserving source image dimensions.
navy='#151c40';teal='#00a6a6'
def font(n,bold=False):return ImageFont.truetype(r'C:\Windows\Fonts\arial'+('bd' if bold else '')+'.ttf',n)
def logo(im,x,y,scale=1,light=False):
 d=ImageDraw.Draw(im);c='white' if light else navy;s=scale
 d.line([(x,y+65*s),(x,y),(x+55*s,y+65*s),(x+55*s,y)],fill=teal,width=max(2,int(9*s)))
 for xx,yy in [(x,y),(x+55*s,y),(x+55*s,y+65*s)]:d.ellipse((xx-7*s,yy-7*s,xx+7*s,yy+7*s),fill=teal)
 d.text((x+78*s,y-5*s),'NOVALIS',font=font(int(47*s),True),fill=c)
 d.text((x+80*s,y+49*s),'T É L É C O M',font=font(int(18*s)),fill=c)
im=Image.new('RGBA',(444,160),(255,255,255,0));logo(im,16,42,0.92);buf=io.BytesIO();im.save(buf,'PNG');parts['word/media/image2.png']=buf.getvalue()
im=Image.new('RGB',(1378,2064),navy);d=ImageDraw.Draw(im);logo(im,245,180,2,True)
for y,t in [(580,'Des solutions pour'),(690,'vos équipes'),(800,'et vos projets')]:d.text((160,y),t,font=font(84,True),fill='white')
for y,t in [(1090,'Téléphonie professionnelle'),(1190,'Internet et réseaux'),(1290,'Assistance et maintenance')]:d.text((165,y),t,font=font(46),fill='#9be2df')
d.line((165,1500,1210,1500),fill=teal,width=4)
d.text((165,1590),'24 avenue des Horizons',font=font(43),fill='white');d.text((165,1660),'44000 Nantes',font=font(43),fill='white');d.text((165,1780),'contact@novalis.example',font=font(40),fill='white');d.text((165,1930),'Identité fictive pour démonstration',font=font(28),fill='#9be2df')
buf=io.BytesIO();im.save(buf,'PNG');parts['word/media/image5.png']=buf.getvalue()
# Strip identifying metadata without touching template machinery.
if 'docProps/core.xml' in parts:
 r=E.fromstring(parts['docProps/core.xml'])
 for el in r:
  if E.QName(el).localname in ['creator','lastModifiedBy']:el.text='NOVALIS Télécom'
 parts['docProps/core.xml']=E.tostring(r,xml_declaration=True,encoding='UTF-8',standalone=True)
cover=base/'new-cover.png'
if cover.exists():
 im=Image.open(cover).convert('RGB').resize((1819,2573));buf=io.BytesIO();im.save(buf,'JPEG',quality=95);parts['word/media/image1.jpeg']=buf.getvalue()
else:raise RuntimeError('Cover missing')
for n in list(parts):
 if n.endswith('.rels'):
  parts[n]=parts[n].replace(b'mailto:technique@e-magnumerique.com',b'mailto:assistance@novalis.example').replace(b'mailto:ytoledano@e-magnumerique.com',b'mailto:contact@novalis.example')
out=base.parent/'proposition-commerciale-demo-novalis.docx'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as target:
 for info in z.infolist():target.writestr(info.filename,parts[info.filename])
changed=[n for n in parts if parts[n]!=z.read(n)]
checks['changed_parts']=changed
checks['source_unchanged']=hashlib.sha256(src.read_bytes()).hexdigest()
(base/'validation.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
print(json.dumps(checks,ensure_ascii=False,indent=2));print(out)

