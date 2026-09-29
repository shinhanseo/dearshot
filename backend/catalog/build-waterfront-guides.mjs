import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Coordinates are measured against the six 941 x 1672 portrait previews.
// Each guide stays fixed; the targetSubjectBox in waterfront-v1.json is used
// to compare the live person detector result with the intended composition.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets", "templates");
const guides = [
  {
    id: "shoreline-sunset-walk",
    horizon: "M0 770 H520 M760 770 H941",
    subject: [
      "M594 770 C604 752 634 752 650 772 C665 791 661 827 649 843 C630 857 601 843 591 822 C584 804 585 782 594 770 Z",
      "M588 850 C568 856 560 878 565 908 L560 1035 C553 1080 549 1143 535 1193 C578 1212 681 1218 744 1185 C710 1094 691 1012 695 924 C697 882 684 857 659 850",
      "M571 887 C556 924 557 990 559 1045 M691 886 C706 938 705 1010 704 1034",
      "M573 1204 C575 1253 588 1280 603 1298 M695 1208 C683 1268 680 1287 708 1304",
    ],
  },
  {
    id: "shoreline-side-gaze",
    horizon: "M0 820 H100 M300 820 H941",
    subject: [
      "M170 699 C143 711 129 754 137 802 C139 846 151 899 158 930 M169 699 C211 682 240 702 248 738 C253 762 253 786 238 802 C219 821 195 818 180 800",
      "M150 805 C127 822 113 875 104 947 L100 1060 C118 1080 244 1078 270 1050 L274 878 C263 832 246 807 230 804",
      "M125 1065 C119 1175 120 1336 113 1436 L189 1442 C201 1341 193 1226 196 1144 M198 1072 C213 1174 214 1324 219 1437 L278 1432 C282 1327 270 1163 260 1063",
    ],
  },
  {
    id: "shoreline-look-back",
    horizon: "M0 575 H100 M700 575 H941",
    subject: [
      "M170 407 C207 341 302 316 398 349 C477 374 518 470 489 547 C475 591 439 628 393 648 M169 410 C124 494 137 630 120 784 C116 881 116 1018 135 1109",
      "M390 648 C333 677 236 655 202 597 M397 654 C452 660 478 695 518 721 C553 779 584 912 610 1062 L681 1435 M235 671 C203 723 181 797 168 882 C151 1037 157 1286 176 1444",
      "M179 1445 C224 1519 313 1573 398 1585 M683 1435 C666 1547 601 1619 547 1672",
    ],
  },
  {
    id: "shoreline-candid-step",
    horizon: "M0 628 H150 M660 628 H941",
    subject: [
      "M324 464 C347 424 410 415 451 445 C486 471 482 532 454 563 C426 586 370 578 339 549 C318 527 310 486 324 464 Z",
      "M330 565 C274 569 244 610 235 682 L193 858 C171 942 166 1000 144 1043 M452 568 C492 582 520 641 521 722",
      "M259 619 C256 793 270 886 287 974 L471 975 C485 891 491 803 485 673",
      "M286 973 C268 1112 269 1238 225 1395 L200 1468 M470 975 C465 1126 464 1293 483 1450 L504 1477",
    ],
  },
  {
    id: "shoreline-sunset-profile",
    horizon: "M470 889 H941",
    subject: [
      "M179 455 C231 418 315 425 357 467 C385 494 399 544 389 586 C382 629 351 659 309 673 M177 455 C126 494 94 554 84 648 C74 764 78 834 88 944",
      "M310 673 C362 670 389 694 418 742 M133 696 C106 739 88 808 67 918 C71 1085 81 1350 94 1672 M408 737 C430 816 429 907 412 1048 L429 1672",
    ],
  },
  {
    id: "waterfront-railing-portrait",
    horizon: null,
    wave: "M0 1320 C235 1190 427 1075 590 995 C740 920 844 867 941 825",
    subject: [
      "M492 460 C503 411 555 385 617 391 C674 396 715 440 711 495 C710 548 683 587 642 610 M492 460 C470 513 482 563 518 588",
      "M636 610 C726 607 806 651 881 735 C916 778 937 819 941 854 M519 597 C489 657 491 738 517 807 C537 865 561 900 592 934",
      "M592 934 C620 979 703 1019 780 1040 M780 1040 C837 1037 899 1021 941 995",
      "M774 1044 C751 1210 754 1433 758 1672 M938 1049 L941 1672",
    ],
  },
];

const shadow = 'fill="none" stroke="#1F302F" stroke-opacity=".38" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"';
const light = 'fill="none" stroke="#FFF9ED" stroke-opacity=".94" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"';

for (const guide of guides) {
  const paths = guide.subject.map((d) => `<path d="${d}"/>`).join("");
  const horizon = guide.horizon
    ? `<g stroke-dasharray="18 15"><path d="${guide.horizon}" ${shadow}/><path d="${guide.horizon}" ${light}/></g>`
    : "";
  const wave = guide.wave
    ? `<g stroke-dasharray="16 13"><path d="${guide.wave}" ${shadow}/><path d="${guide.wave}" ${light}/></g>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="941" height="1672" viewBox="0 0 941 1672" fill="none">\n` +
    `  <title>${guide.id} composition guide</title>\n` +
    `  ${horizon}${wave}\n` +
    `  <g ${shadow}>${paths}</g>\n` +
    `  <g ${light}>${paths}</g>\n` +
    `</svg>\n`;
  const directory = path.join(root, guide.id, "v1");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "guide.svg"), svg);
}
