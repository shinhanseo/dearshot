import sharp from '../../../backend/node_modules/sharp/dist/index.mjs';
import {mkdir,writeFile,copyFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const source='/Users/shinhanseo/.codex/generated_images/01a0722b-40c4-7352-ab43-a94b8a55504f';
export const entries=[
 ['library-01','e14e3ef3-08d9-4c9f-8e3f-5d4c102e2225','책장 사이 작은 인물'],
 ['library-02','1d48431c-bd7c-40a2-8b57-ed913adcc1f2','책을 고르는 순간'],
 ['library-03','6019a887-2a9c-4e7e-acbb-d6352ab4f911','창가에서 책 읽기'],
 ['library-04','ef5b697e-5ddf-4805-b9d3-db2b7ec2a2ee','책장 틈의 시선'],
 ['library-05','1ac08d77-af6c-4652-a5a6-cdec74f5c5d2','서가를 걷다 돌아보기'],
 ['library-06','80987e8c-c891-4f95-b873-4e63ea464417','긴 독서 테이블'],
 ['museum-01','376e4996-34ea-4d09-8e70-2228ebfce92f','작품 옆의 여백'],
 ['museum-02','750b78fb-6bee-4a27-a722-7a0c82cea53e','조각과 마주보기'],
 ['museum-03','6d612837-f232-4100-b363-951c4dcd28c8','벤치에서 감상하기'],
 ['museum-04','21ac0b07-d5a8-4ba9-9ba9-82fcc6837e38','빛을 따라 걷기'],
 ['museum-05','ddf0ae27-e066-41b3-a651-8c6d1d833578','문틀 너머의 인물'],
 ['museum-06','d36dc81c-bd2f-40b9-a823-1981d665f4fa','곡선 아래 한 걸음'],
 ['greenhouse-01','dafbe59a-0280-494b-b33c-7c35f9f06816','유리 아치의 중심'],
 ['greenhouse-02','7bbd2476-2fcd-41e7-8dac-b43b820436ad','잎 사이로 돌아보기'],
 ['greenhouse-03','573ae85d-5824-4c9b-8168-2dc162f5bc48','창가의 초록빛'],
 ['greenhouse-04','81f52295-43fd-446a-b0a7-fc9f94a39c15','온실 벤치의 쉼'],
 ['greenhouse-05','cbbd1aa6-c534-4e29-83d0-76c537c09508','초록 통로 걷기'],
 ['greenhouse-06','e0ac42b3-c8b5-4527-be53-e0f467e261f6','유리문 옆 햇살'],
];
for(const [id,file] of entries){const dir=path.join(root,id);await mkdir(dir,{recursive:true});const dest=path.join(dir,'example.png');try{await readFile(dest);}catch{await copyFile(path.join(source,`exec-${file}.png`),dest);}const meta=await sharp(dest).metadata();if(Math.abs(meta.width/meta.height-9/16)>0.002)throw Error(`Not portrait9:16: ${id}`);await sharp(dest).resize(360,640).webp({quality:85}).toFile(path.join(dir,'thumbnail.webp'));}
for(const group of ['library','museum','greenhouse']){const tiles=[];for(let i=0;i<6;i++){const [id]=entries.filter(e=>e[0].startsWith(group))[i];tiles.push({input:await sharp(path.join(root,id,'example.png')).resize(300,533).png().toBuffer(),left:(i%3)*310,top:Math.floor(i/3)*563+30});tiles.push({input:Buffer.from(`<svg width="300" height="28"><text x="8" y="20" font-size="18" fill="white">${group.toUpperCase()} ${i+1}</text></svg>`),left:(i%3)*310,top:Math.floor(i/3)*563});}await sharp({create:{width:920,height:1126,channels:4,background:'#25302e'}}).composite(tiles).png().toFile(path.join(root,`${group}-examples.png`));}
await writeFile(path.join(root,'selection.json'),JSON.stringify(entries.map(([id,file,title])=>({id,title,sourceFile:`exec-${file}.png`,aspectRatio:'9:16',status:'CANDIDATE'})),null,2));
