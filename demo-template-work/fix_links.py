from pathlib import Path
p=Path('demo-template-work/build_demo.py')
s=p.read_text(encoding='utf-8-sig');s=s.replace("out=base.parent/'proposition-commerciale-demo-novalis.docx'", "for n in list(parts):\n if n.endswith('.rels'):\n  parts[n]=parts[n].replace(b'mailto:technique@e-magnumerique.com',b'mailto:assistance@novalis.example').replace(b'mailto:ytoledano@e-magnumerique.com',b'mailto:contact@novalis.example')\nout=base.parent/'proposition-commerciale-demo-novalis.docx'")
p.write_text(s,encoding='utf-8')
