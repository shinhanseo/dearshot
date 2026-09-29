import sharp from 'sharp';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const sourceRoot=process.argv[2];
const entries=[
  {
    "n": 1,
    "id": "green-picnic-pause",
    "file": "a1d37462-2081-4924-87b2-6c0ffb7c8619",
    "ko": "나무 그늘 아래 피크닉",
    "en": "Picnic pause",
    "box": [
      0.08,
      0.39,
      0.93,
      0.84
    ],
    "tips": [
      "인물을 오른쪽 아래에 두고 잔디 여백을 넓게 남기세요.",
      "무릎에 손을 모으고 카메라 쪽으로 고개를 돌리세요."
    ],
    "eng": [
      "Place the subject lower right and leave room for the lawn.",
      "Rest both hands on the knees and turn toward the camera."
    ],
    "body": [
      "M609 745 C620 678 686 650 741 667 C805 679 826 735 807 790 Q844 833 806 860 L770 884",
      "M620 751 L605 788 Q604 825 650 850 Q688 885 724 864",
      "M667 870 Q621 899 583 954 L522 1021 M760 880 Q821 884 842 974 L864 1190 Q880 1300 831 1354 Q771 1421 656 1393",
      "M758 991 Q710 1035 650 1093 L538 1146 Q502 1165 469 1137 L357 1088 Q328 1074 345 1048 Q368 1025 409 1040 L488 1053",
      "M522 1021 Q471 990 427 1021 L331 1139 L216 1269 L104 1302 Q68 1320 81 1346 Q139 1381 239 1365 L300 1350 L454 1181",
      "M455 1180 Q495 1303 610 1370 L660 1392 M303 1334 Q401 1377 493 1331"
    ],
    "lines": [
      "M0 1177 L92 1182 M871 1269 L941 1277"
    ]
  },
  {
    "n": 3,
    "id": "green-garden-flowers",
    "file": "efc10620-44a4-433b-94cd-21c2b4f02cae",
    "ko": "꽃 사이로 가까이",
    "en": "Among the flowers",
    "box": [
      0,
      0.11,
      0.61,
      1
    ],
    "tips": [
      "얼굴을 왼쪽 위에 두고 꽃을 앞쪽에 담으세요.",
      "꽃을 내려다보는 자연스러운 옆모습을 촬영하세요."
    ],
    "eng": [
      "Place the face upper left with flowers in the foreground.",
      "Capture a relaxed glance down toward the flowers."
    ],
    "body": [
      "M23 533 C25 370 69 235 211 201 C333 166 438 208 460 321 Q486 437 435 560 L450 660",
      "M138 442 Q121 509 166 567 Q219 638 281 637 Q337 622 370 557 L399 445",
      "M134 576 L98 650 M283 634 L295 681",
      "M30 637 L0 663 M420 643 Q493 635 518 703 L545 899",
      "M0 854 L31 1057 Q49 1110 135 1092 L294 1012 L425 967 Q479 956 522 985 L550 1006 Q566 1054 524 1090 L462 1111 L379 1118 L192 1223 Q99 1305 0 1256",
      "M163 1241 L195 1307 Q321 1286 471 1263 M26 1303 L0 1450 M480 1262 L532 1519"
    ],
    "lines": []
  },
  {
    "n": 6,
    "id": "green-garden-arch",
    "file": "a3ab8918-d7a6-4324-81f1-841d03adbaf3",
    "ko": "정원 아치 아래",
    "en": "Garden arch",
    "box": [
      0.23,
      0.375,
      0.53,
      0.915
    ],
    "tips": [
      "아치 안쪽에 인물을 세우고 발끝까지 담으세요.",
      "아치의 곡선과 길이 인물 주변을 감싸도록 맞추세요."
    ],
    "eng": [
      "Frame the full body inside the garden arch.",
      "Use the arch and path to frame the subject."
    ],
    "body": [
      "M306 681 Q300 646 342 638 Q393 629 412 662 L415 700 L395 739 M307 683 L307 723 Q330 750 365 748",
      "M327 749 L309 774 Q267 780 253 812 L236 912 L230 1019 L231 1082 Q245 1110 264 1101 L264 1070 L274 968",
      "M395 749 L420 778 Q476 791 486 836 L488 928 L466 1009 L443 1038",
      "M278 969 Q345 986 436 970 L449 1071 L420 1260 L390 1408 M279 975 L272 1100 L289 1271 L287 1448 L269 1488 Q251 1523 277 1529 L322 1517 L341 1478 L347 1281 L353 1147",
      "M351 1405 L345 1449 Q360 1480 393 1465 L399 1425"
    ],
    "lines": [
      "M152 512 C155 191 778 139 813 464",
      "M496 1279 Q547 1137 664 1114"
    ]
  },
  {
    "n": 7,
    "id": "green-hedge-look-back",
    "file": "fa73cb3b-14f9-4d1d-93ec-5856c97c6840",
    "ko": "초록빛 어깨 너머",
    "en": "Green look-back",
    "box": [
      0.35,
      0.19,
      0.94,
      1
    ],
    "tips": [
      "인물을 오른쪽에 두고 왼쪽에 초록 여백을 남기세요.",
      "어깨 너머로 돌아보며 머리카락을 가볍게 정리하세요."
    ],
    "eng": [
      "Keep the subject on the right with greenery on the left.",
      "Look back over the shoulder and lightly touch the hair."
    ],
    "body": [
      "M524 476 Q514 388 592 351 C689 311 778 354 801 422 Q833 469 827 571 L855 770 Q899 891 822 958",
      "M541 462 L526 511 Q521 572 571 607 Q615 636 680 598",
      "M529 472 Q505 460 493 495 L478 571 L424 668 L408 708 M524 587 L486 699",
      "M408 693 Q375 713 354 780 Q325 845 377 883 L464 903 Q527 879 563 824",
      "M623 649 Q556 646 498 688 M843 938 L871 1093 L872 1214 Q886 1300 850 1334 Q675 1352 484 1232 L460 1152 L469 901",
      "M493 1232 L488 1433 L505 1672 M850 1333 L840 1498 L818 1672 M706 1440 L699 1672"
    ],
    "lines": []
  },
  {
    "n": 8,
    "id": "green-tree-lean",
    "file": "a119b369-ab45-4c57-889c-90136a533a8b",
    "ko": "나무에 기대어",
    "en": "Beside the tree",
    "box": [
      0.085,
      0.25,
      0.5,
      0.91
    ],
    "tips": [
      "인물을 왼쪽 나무 옆에 두고 오른쪽 잔디를 넓게 담으세요.",
      "어깨를 가볍게 기대고 발목을 편하게 교차하세요."
    ],
    "eng": [
      "Place the subject beside the left tree with open lawn on the right.",
      "Lean a shoulder lightly and cross the ankles comfortably."
    ],
    "body": [
      "M170 487 Q154 445 202 436 Q267 420 300 452 Q325 484 297 533 L277 566 M177 490 L180 537 Q205 581 252 578",
      "M195 570 L154 588 Q108 594 96 638 L89 742 L98 861 L122 961 L139 1008 Q164 1031 178 1009 L169 963 L157 841 L157 764",
      "M284 582 Q345 598 365 641 L378 764 L389 864 L380 913 M159 894 Q258 887 352 857",
      "M174 904 L173 1040 L214 1194 L267 1372 L274 1442 Q286 1503 340 1514 Q376 1516 366 1484 L339 1421 L324 1329 L292 1155",
      "M379 906 L377 1106 L367 1214 L436 1326 Q473 1335 462 1370 L451 1454 Q445 1481 416 1482 L390 1434 L386 1369 L274 1237"
    ],
    "lines": [
      "M211 0 Q256 181 197 420 M99 1080 L58 1440"
    ]
  },
  {
    "n": 10,
    "id": "green-garden-reading",
    "file": "ef99b692-7c4b-47ee-b663-8a5b9fb65c22",
    "ko": "공원에서 책 한 페이지",
    "en": "A page in the park",
    "box": [
      0,
      0.1,
      1,
      1
    ],
    "tips": [
      "책과 손이 함께 보이도록 비스듬히 내려다보며 촬영하세요.",
      "얼굴은 왼쪽 위에 두고 돌담의 사선을 살리세요."
    ],
    "eng": [
      "Shoot slightly downward so the book and hands are visible.",
      "Place the face upper left and use the diagonal stone ledge."
    ],
    "body": [
      "M191 340 C169 246 251 173 365 194 C459 192 522 244 529 321 L541 394 Q531 451 506 485",
      "M217 405 Q206 467 261 533 Q321 595 375 612 Q429 596 461 551 L487 478",
      "M218 468 L175 477 Q74 514 0 600 M379 599 L406 565 Q511 581 549 669 L570 797 L564 932 L590 981 L637 1029",
      "M0 855 L15 1016 Q16 1095 77 1127 L155 1171 L334 1220 Q408 1245 473 1200 L541 1156 Q554 1121 528 1115 L463 1137 L398 1121 L238 1119 L152 1071",
      "M584 960 L574 1017 Q594 1041 620 1047 M86 1192 Q42 1323 147 1400 L366 1454 L595 1580 L654 1672 M564 1159 Q711 1152 792 1300 L869 1457 L941 1637"
    ],
    "lines": [
      "M661 1061 L786 973 L818 985 L697 1139 L531 1168",
      "M658 898 L941 739"
    ]
  }
];
const manifest={catalogVersion:'green-space-2026-09-28-v1',scenes:[{key:'green-space',active:true,thumbnailPath:'templates/green-picnic-pause/v1/thumbnail.webp',sortOrder:3,localizations:{'ko-KR':{displayName:'공원 · 초록 공간'},'en-US':{displayName:'Green space'}}}],templates:[]};
for(const [i,e] of entries.entries()){
const dir=path.join(here,'assets/templates',e.id,'v1');await mkdir(dir,{recursive:true});
if(sourceRoot){const source=path.join(sourceRoot,`exec-${e.file}.png`);const m=await sharp(source).metadata();if(Math.abs(m.width-941)>1||m.height!==1672)throw Error(`Unexpected dimensions ${e.id}: ${m.width}x${m.height}`);await sharp(source).resize(941,1672,{fit:"fill"}).webp({quality:90}).toFile(path.join(dir,'preview.webp'));await sharp(source).resize(360,640,{fit:"fill"}).webp({quality:82}).toFile(path.join(dir,'thumbnail.webp'));}
const body=e.body.map(d=>`<path d="${d}"/>`).join('');const lines=e.lines.map(d=>`<path d="${d}"/>`).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="941" height="1672" viewBox="0 0 941 1672" fill="none"><title>${e.en} composition guide</title><g stroke-linecap="round" stroke-linejoin="round"><g stroke="#1F302F" stroke-opacity=".38" stroke-width="10">${body}<g stroke-dasharray="18 15">${lines}</g></g><g stroke="#FFF9ED" stroke-opacity=".94" stroke-width="4">${body}<g stroke-dasharray="18 15">${lines}</g></g></g></svg>`;
await writeFile(path.join(dir,'guide.svg'),svg);
const [left,top,right,bottom]=e.box;
const loc=(title,tips)=>({title,summary:tips[0],instructions:tips.map((text,j)=>({order:j+1,text}))});
manifest.templates.push({id:e.id,peopleCount:1,supportedAspectRatios:['9:16'],sortOrder:i+1,scenes:[{key:'green-space',sortOrder:i+1}],currentVersion:1,versions:[{version:1,previewPath:`templates/${e.id}/v1/preview.webp`,thumbnailPath:`templates/${e.id}/v1/thumbnail.webp`,guide:{type:'SVG_OVERLAY',assetPath:`templates/${e.id}/v1/guide.svg`,config:{coordinateSpace:'NORMALIZED',referenceWidth:941,referenceHeight:1672,targetSubjectBox:{left,top,right,bottom},safeArea:{left:0,top:0,right:1,bottom:1}}},publishedAt:'2026-09-28T00:00:00+09:00',localizations:{'ko-KR':loc(e.ko,e.tips),'en-US':loc(e.en,e.eng)}}]});
}
await writeFile(path.join(here,'green-space-v1.json'),JSON.stringify(manifest,null,2)+'\n');
// Contact sheet shows each fixed guide on its matching image for alignment review.
const tiles=[];for(const [i,e]of entries.entries()){const dir=path.join(here,'assets/templates',e.id,'v1');const svg=await readFile(path.join(dir,'guide.svg'));const full=await sharp(path.join(dir,'preview.webp')).composite([{input:svg}]).png().toBuffer();const buf=await sharp(full).resize(282,502).png().toBuffer();tiles.push({input:buf,left:(i%3)*294,top:Math.floor(i/3)*538+30});const label=Buffer.from(`<svg width="282" height="28"><text x="8" y="21" fill="#fff" font-size="18">${e.n} / ${e.en}</text></svg>`);tiles.push({input:label,left:(i%3)*294,top:Math.floor(i/3)*538});}
await sharp({create:{width:870,height:1076,channels:4,background:'#202522'}}).composite(tiles).png().toFile(path.join(here,'../../docs/design/green-space-overlay-review.png'));
console.log('Built 6 green-space templates and review sheet.');
