import sharp from 'sharp';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const sourceRoot=process.argv[2];
const entries=[
  {
    "n": 1,
    "id": "urban-alley-look-back",
    "file": "ee934478-0d64-494f-869c-8d0da2027799",
    "ko": "골목에서 돌아보기",
    "en": "Alley look-back",
    "box": [
      0.65,
      0.285,
      0.965,
      0.915
    ],
    "tips": [
      "인물을 오른쪽에 두고 골목의 깊이를 왼쪽에 담으세요.",
      "걸어가다가 어깨 너머로 카메라를 돌아보세요."
    ],
    "eng": [
      "Place the subject on the right with alley depth on the left.",
      "Look back over the shoulder while walking away."
    ],
    "body": [
      "M651 549 Q647 492 704 480 Q764 468 786 518 L802 588 Q823 644 842 682 Q864 747 839 790",
      "M658 542 L647 568 L657 585 Q660 612 685 620 L711 610",
      "M677 626 Q638 640 633 695 L628 792 L615 873 Q611 918 637 931 L665 907 M845 687 Q875 712 880 765 L886 829",
      "M667 710 Q704 762 711 806 L673 859 L649 882 M656 914 Q730 928 818 914 L831 1010 L810 1138 L790 1245 L798 1422 L705 1443 L677 1345 L643 1181 L636 1013 Z",
      "M753 1031 L751 1168 L776 1322 M706 1444 L719 1468 Q706 1499 726 1512 Q762 1533 803 1519 L800 1494 L787 1455 L786 1426"
    ],
    "lines": [
      "M75 1672 L583 920",
      "M0 265 L491 514"
    ]
  },
  {
    "n": 4,
    "id": "urban-crosswalk-step",
    "file": "f1426ae4-8f3c-4ce1-89b3-f9d166b545ea",
    "ko": "횡단보도의 한 걸음",
    "en": "Crosswalk step",
    "box": [
      0.215,
      0.312,
      0.58,
      0.855
    ],
    "tips": [
      "발끝까지 담고 횡단보도의 사선을 살리세요.",
      "보행 신호에 맞춰 자연스럽게 걷는 순간을 촬영하세요."
    ],
    "eng": [
      "Include the feet and the diagonal crossing stripes.",
      "Capture a natural stride while the pedestrian signal is green."
    ],
    "body": [
      "M361 600 Q335 547 378 532 Q432 512 476 548 L483 590 L470 618 M361 593 L370 635 Q408 671 446 642 L462 619",
      "M373 651 L326 671 Q292 682 284 735 L271 855 L265 913 M457 654 Q514 663 531 712 L542 814 L522 868 L502 908",
      "M305 784 L310 867 L331 900 Q416 922 481 890 L488 824 M268 912 L251 948 L235 1000 Q258 1023 287 1005 L301 980",
      "M334 900 L322 1048 L331 1173 L353 1277 L391 1290 M486 899 L488 1079 L467 1239 L466 1371 L402 1386 L379 1249 L397 1124 L402 1013",
      "M353 1277 L348 1295 Q367 1312 391 1302 M402 1382 L399 1406 Q417 1430 450 1421 L465 1401 L461 1372"
    ],
    "lines": [
      "M0 1228 L258 1169",
      "M535 1145 L941 1042"
    ]
  },
  {
    "n": 6,
    "id": "urban-campus-walk",
    "file": "f86986f8-fc32-42e3-b14c-879c1c303267",
    "ko": "캠퍼스를 걷는 오후",
    "en": "Campus walk",
    "box": [
      0.225,
      0.435,
      0.495,
      0.91
    ],
    "tips": [
      "인물을 왼쪽 아래에 두고 건물과 산책길을 함께 담으세요.",
      "시선을 옆으로 두고 카메라 쪽으로 천천히 걸어오세요."
    ],
    "eng": [
      "Place the subject lower left with buildings and walkway visible.",
      "Walk toward the camera while glancing sideways."
    ],
    "body": [
      "M283 779 Q278 744 314 735 Q354 725 376 751 L382 791 L367 823 M286 780 L280 799 L289 813 Q312 840 343 834",
      "M291 836 L268 857 Q234 864 226 913 L214 1034 L220 1124 L238 1138 M350 839 L387 859 Q433 870 447 908 L461 986 L445 1052 L419 1097",
      "M262 961 L256 1090 Q324 1120 404 1105 L412 1008 M220 1125 L223 1168 Q239 1185 251 1169 L249 1133",
      "M260 1096 L253 1210 L272 1328 L282 1445 L334 1456 L347 1324 L365 1226 L365 1146 M410 1103 L409 1240 L388 1329 L355 1400 L334 1391",
      "M282 1444 L271 1477 Q269 1504 304 1509 L339 1493 L334 1456 M354 1376 L365 1394 Q380 1407 390 1390 L389 1351"
    ],
    "lines": [
      "M0 1556 L188 1199",
      "M477 1178 L941 1361"
    ]
  },
  {
    "n": 7,
    "id": "urban-plaza-space",
    "file": "49a320af-7c5a-43d9-a091-13ab2f4f6d47",
    "ko": "광장 속 작은 인물",
    "en": "Open plaza",
    "box": [
      0.16,
      0.57,
      0.36,
      0.912
    ],
    "tips": [
      "인물을 왼쪽 아래에 작게 두고 건물과 하늘을 넓게 담으세요.",
      "몸과 시선을 여백이 있는 오른쪽으로 살짝 돌리세요."
    ],
    "eng": [
      "Keep the subject small at lower left with architecture and sky.",
      "Turn slightly toward the open space on the right."
    ],
    "body": [
      "M191 1004 Q192 967 223 960 Q263 951 280 981 L278 1011 M245 982 L268 990 L281 1004 L273 1019 Q257 1040 232 1026",
      "M195 1008 L181 1050 Q161 1071 156 1106 L155 1150 L175 1180 L179 1205 M275 1033 Q308 1043 325 1080 L337 1113 L327 1162 L312 1200",
      "M211 1086 L207 1191 M177 1201 L178 1331 L174 1402 Q246 1440 333 1405 L306 1236 L301 1191",
      "M204 1423 L208 1472 L199 1491 Q192 1517 214 1518 L237 1496 L232 1470 L230 1428 M253 1427 L258 1460 Q280 1488 272 1493 L247 1495 L234 1477"
    ],
    "lines": [
      "M365 1080 L941 1077",
      "M369 1270 L815 1672"
    ]
  },
  {
    "n": 8,
    "id": "urban-railing-profile",
    "file": "27603a60-f175-41bf-9917-77ee53db99cd",
    "ko": "도시 난간에 기대어",
    "en": "Street railing",
    "box": [
      0.24,
      0.25,
      1,
      1
    ],
    "tips": [
      "인물을 오른쪽에 두고 난간이 왼쪽 아래에서 이어지게 맞추세요.",
      "팔을 난간에 편하게 올리고 거리 쪽을 바라보세요."
    ],
    "eng": [
      "Place the subject right with the railing leading from lower left.",
      "Rest the forearms comfortably and look along the street."
    ],
    "body": [
      "M401 505 Q377 449 431 431 Q523 400 594 457 Q656 468 657 525 L636 601 L595 643",
      "M408 509 L413 546 L394 575 L412 586 L403 612 Q411 642 455 661 L486 653",
      "M455 661 L476 704 M606 633 Q691 657 750 730 L808 851 L854 951 L904 1044 L936 1153 L895 1193 L771 1266 L600 1309 L556 1183 L536 1031",
      "M645 763 Q615 835 548 855 L398 842 Q325 832 291 866 L270 914 L300 965 L405 983 Q460 1020 521 1003 L664 951 L744 884",
      "M272 915 L249 943 L234 982 Q236 1008 254 1023 L273 1028 L279 1001 L302 973",
      "M601 1307 L611 1444 L620 1672 M936 1201 L941 1378 M782 1383 L750 1550 L749 1672"
    ],
    "lines": [
      "M0 1560 L361 1028",
      "M64 1160 L210 949"
    ]
  },
  {
    "n": 10,
    "id": "urban-museum-bench",
    "file": "7cfb0850-ca3d-419a-aa5d-0c9ea7c9f8b5",
    "ko": "미술관 앞 벤치",
    "en": "Museum bench",
    "box": [
      0.28,
      0.375,
      1,
      1
    ],
    "tips": [
      "앉은 눈높이보다 조금 위에서 비스듬히 촬영하세요.",
      "상체를 살짝 숙이고 손을 편하게 모으세요."
    ],
    "eng": [
      "Shoot diagonally from slightly above seated eye level.",
      "Lean forward a little and loosely bring the hands together."
    ],
    "body": [
      "M549 730 Q533 677 582 653 Q646 622 700 656 Q746 662 750 710 L734 769 M549 733 Q536 765 555 789 L577 788 Q600 835 647 839 Q681 824 708 787 L727 740",
      "M566 803 L522 817 Q443 814 391 867 Q309 924 287 1014 L269 1120 L274 1190 L308 1210",
      "M689 843 Q731 876 736 954 L742 1058 L753 1116 L701 1147 M414 986 L424 1124 L444 1199 L566 1248 L595 1273 L553 1321 L462 1311 Q373 1290 340 1256",
      "M752 1117 L788 1196 L816 1265 L853 1297 L863 1351 Q871 1394 842 1408 L811 1397 L782 1366 M700 1148 L725 1220 L750 1267 M590 1271 L676 1290 L754 1280 L797 1284 L830 1311 L844 1333 L828 1350 L813 1381 L771 1403 L705 1362 L552 1320",
      "M275 1194 Q255 1281 288 1356 L375 1429 L456 1589 L573 1642 L649 1606 L576 1432 L498 1375 M766 1157 Q844 1165 856 1249 M866 1385 L887 1546 L937 1605 Q935 1655 886 1672 M575 1641 L583 1672"
    ],
    "lines": [
      "M0 1327 L254 1199",
      "M790 971 L941 899"
    ]
  }
];
const manifest={catalogVersion:'urban-street-2026-09-28-v1',scenes:[{key:'urban-street',active:true,thumbnailPath:'templates/urban-alley-look-back/v1/thumbnail.webp',sortOrder:4,localizations:{'ko-KR':{displayName:'거리 · 도시 공간'},'en-US':{displayName:'Urban street'}}}],templates:[]};
for(const [i,e] of entries.entries()){
const dir=path.join(here,'assets/templates',e.id,'v1');await mkdir(dir,{recursive:true});
if(sourceRoot){const source=path.join(sourceRoot,`exec-${e.file}.png`);const m=await sharp(source).metadata();if(Math.abs(m.width-941)>1||m.height!==1672)throw Error(`Unexpected dimensions ${e.id}: ${m.width}x${m.height}`);await sharp(source).resize(941,1672,{fit:"fill"}).webp({quality:90}).toFile(path.join(dir,'preview.webp'));await sharp(source).resize(360,640,{fit:"fill"}).webp({quality:82}).toFile(path.join(dir,'thumbnail.webp'));}
const body=e.body.map(d=>`<path d="${d}"/>`).join('');const lines=e.lines.map(d=>`<path d="${d}"/>`).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="941" height="1672" viewBox="0 0 941 1672" fill="none"><title>${e.en} composition guide</title><g stroke-linecap="round" stroke-linejoin="round"><g stroke="#1F302F" stroke-opacity=".38" stroke-width="10">${body}<g stroke-dasharray="18 15">${lines}</g></g><g stroke="#FFF9ED" stroke-opacity=".94" stroke-width="4">${body}<g stroke-dasharray="18 15">${lines}</g></g></g></svg>`;
await writeFile(path.join(dir,'guide.svg'),svg);
const [left,top,right,bottom]=e.box;
const loc=(title,tips)=>({title,summary:tips[0],instructions:tips.map((text,j)=>({order:j+1,text}))});
manifest.templates.push({id:e.id,peopleCount:1,supportedAspectRatios:['9:16'],sortOrder:i+1,scenes:[{key:'urban-street',sortOrder:i+1}],currentVersion:1,versions:[{version:1,previewPath:`templates/${e.id}/v1/preview.webp`,thumbnailPath:`templates/${e.id}/v1/thumbnail.webp`,guide:{type:'SVG_OVERLAY',assetPath:`templates/${e.id}/v1/guide.svg`,config:{coordinateSpace:'NORMALIZED',referenceWidth:941,referenceHeight:1672,targetSubjectBox:{left,top,right,bottom},safeArea:{left:0,top:0,right:1,bottom:1}}},publishedAt:'2026-09-28T00:00:00+09:00',localizations:{'ko-KR':loc(e.ko,e.tips),'en-US':loc(e.en,e.eng)}}]});
}
await writeFile(path.join(here,'urban-street-v1.json'),JSON.stringify(manifest,null,2)+'\n');
// Contact sheet shows each fixed guide on its matching image for alignment review.
const tiles=[];for(const [i,e]of entries.entries()){const dir=path.join(here,'assets/templates',e.id,'v1');const svg=await readFile(path.join(dir,'guide.svg'));const full=await sharp(path.join(dir,'preview.webp')).composite([{input:svg}]).png().toBuffer();const buf=await sharp(full).resize(282,502).png().toBuffer();tiles.push({input:buf,left:(i%3)*294,top:Math.floor(i/3)*538+30});const label=Buffer.from(`<svg width="282" height="28"><text x="8" y="21" fill="#fff" font-size="18">${e.n} / ${e.en}</text></svg>`);tiles.push({input:label,left:(i%3)*294,top:Math.floor(i/3)*538});}
await sharp({create:{width:870,height:1076,channels:4,background:'#202522'}}).composite(tiles).png().toFile(path.join(here,'../../docs/design/urban-street-overlay-review.png'));
console.log('Built 6 urban-street templates and review sheet.');
