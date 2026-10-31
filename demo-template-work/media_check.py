from PIL import Image,ImageOps,ImageDraw
import glob,os
out=Image.new('RGB',(900,1100),'#dddddd');d=ImageDraw.Draw(out)
y=0
for f in glob.glob('demo-template-work/image*'):
 im=Image.open(f);print(f,im.size);im.thumbnail((850,190));out.paste(im,(10,y+25));d.text((10,y),os.path.basename(f),fill='black');y+=220
out.save('demo-template-work/media-overview.png')
