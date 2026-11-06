import sharp from 'sharp';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const source=path.resolve(here,'../../docs/design/place-candidates-2026-11-06');
const entries=JSON.parse(await readFile(path.join(source,'selection.json'),'utf8'));
const groups=[['library','서점 · 도서관','Bookstore & library'],['museum','미술관 · 전시실','Museum & gallery'],['greenhouse','실내 온실','Indoor greenhouse']];
const descriptions={
'library-01':['Small between the shelves','책장을 대칭으로 담고 인물을 아래쪽에 작게 배치하세요.','Frame the shelves symmetrically with a small subject near the bottom.'],
'library-02':['Choosing a book','책장 옆에 서서 눈높이에 있는 책을 고르는 순간을 담으세요.','Stand beside a shelf and reach for a book at eye level.'],
'library-03':['Reading by the window','창가에 옆으로 앉아 책을 읽고 다리의 대각선을 살리세요.','Read beside the window and follow the diagonal line of the legs.'],
'library-04':['Through a gap in the books','책 사이의 빈 공간으로 얼굴을 감싸고 가까이 촬영하세요.','Frame the face through a gap between foreground books.'],
'library-05':['A look back among books','서가의 곡선을 배경으로 안전한 통로에서 걸으며 돌아보세요.','Walk along the safe aisle and look back against the curved shelves.'],
'library-06':['At the reading table','긴 독서 테이블의 사선을 살려 앉아서 읽는 모습을 담으세요.','Use the long table as a leading line toward a seated reader.'],
'museum-01':['Space beside the artwork','작품과 인물 사이에 여백을 두고 전신을 작게 담으세요.','Leave space between the artwork and a small full-body subject.'],
'museum-02':['Facing a sculpture','조각에 손대지 않고 거리를 둔 채 옆모습을 담으세요.','Photograph a side profile at a respectful distance without touching the sculpture.'],
'museum-03':['A gallery bench','벤치에 편하게 앉아 작품을 바라보고 발끝까지 담으세요.','Sit on the bench looking toward the artwork and include the shoes.'],
'museum-04':['Walking through the light','벽에 드리운 빛과 그림자를 살리고 자연스러운 걸음을 담으세요.','Use the wall light and shadows to frame a natural stride.'],
'museum-05':['Through the gallery doors','문틀이 겹쳐 보이도록 정렬하고 인물을 가운데에 작게 두세요.','Align the repeated doorways around a small centered subject.'],
'museum-06':['Beneath the curve','곡선 계단을 크게 담고 아래 공간을 걷는 인물을 배치하세요.','Frame the sweeping staircase above a person walking beneath it.'],
'greenhouse-01':['Under the glass arches','유리 아치가 대칭이 되도록 통로 중앙에서 전신을 담으세요.','Frame the full body centrally beneath symmetrical glass arches.'],
'greenhouse-02':['A glance through the leaves','큰 잎을 전경 가장자리에 두고 어깨 너머로 돌아보세요.','Place large leaves at the foreground edges and look back over a shoulder.'],
'greenhouse-03':['Green window light','유리창 옆에서 식물에 손대지 않고 손을 가볍게 들어보세요.','Stand by the glass and gently raise a hand without touching the plants.'],
'greenhouse-04':['A greenhouse pause','벤치에 비스듬히 앉아 다리의 사선과 주변 식물을 함께 담으세요.','Sit diagonally on a bench with the plants surrounding the legs.'],
'greenhouse-05':['Walking among green leaves','유리 지붕과 통로를 함께 담으며 자연스럽게 걸어오세요.','Walk naturally toward the camera with the glass roof and path visible.'],
'greenhouse-06':['Sunlight beside the glass door','유리문 옆에 옆으로 서서 햇빛과 긴 그림자를 함께 담으세요.','Stand side-on by the glass door with sunlight and a long shadow.']
};
const manifest={catalogVersion:'places-expansion-2026-11-06-v1',scenes:groups.map(([key,ko,en],i)=>({key,active:true,sortOrder:8+i,thumbnailPath:`templates/${key}-01/v1/thumbnail.webp`,localizations:{'ko-KR':{displayName:ko},'en-US':{displayName:en}}})),templates:[]};
for(const [i,e] of entries.entries()){
 const dir=path.join(here,'assets/templates',e.id,'v1');await mkdir(dir,{recursive:true});
 const image=path.join(source,e.id,'example.png');const metadata=await sharp(image).metadata();
 if(metadata.width!==941||metadata.height!==1672)throw Error(`Unexpected image size ${e.id}`);
 await sharp(image).webp({quality:90}).toFile(path.join(dir,'preview.webp'));
 await sharp(image).resize(360,640).webp({quality:83}).toFile(path.join(dir,'thumbnail.webp'));
 await copyFile(path.join(source,e.id,'guide.svg'),path.join(dir,'guide.svg'));
 const [en,koTip,enTip]=descriptions[e.id];
 const localize=(title,tip,second)=>({title,summary:tip,instructions:[{order:1,text:tip},{order:2,text:second}]});
 manifest.templates.push({id:e.id,peopleCount:1,supportedAspectRatios:['9:16'],sortOrder:200+i,scenes:[{key:e.id.split('-')[0],sortOrder:Number(e.id.slice(-2))}],currentVersion:1,versions:[{version:1,previewPath:`templates/${e.id}/v1/preview.webp`,thumbnailPath:`templates/${e.id}/v1/thumbnail.webp`,guide:{type:'SVG_OVERLAY',assetPath:`templates/${e.id}/v1/guide.svg`,config:{coordinateSpace:'NORMALIZED',referenceWidth:941,referenceHeight:1672,safeArea:{left:0,top:0,right:1,bottom:1}}},publishedAt:'2026-11-06T00:00:00+09:00',localizations:{'ko-KR':localize(e.title,koTip,'실선에 인물의 자세를, 점선에 주변 공간의 선을 맞춰보세요.'),'en-US':localize(en,enTip,'Align the pose to the solid guide and the surroundings to the dashed lines.')}}]});
}
await writeFile(path.join(here,'places-expansion-v1.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Built 18 portrait catalog templates across library, museum and greenhouse.');
