# YOLOX-Nano Android asset contract

Source: https://github.com/Megvii-BaseDetection/YOLOX/releases/tag/0.1.1rc0
Model URL: https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.onnx
Downloaded and checked: 2026-10-28. FP32, ONNX opset 11.
SHA256: c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d
Size: 3,659,407 bytes.

## Input
- Name `images`, float32 NCHW `[1, 3, 416, 416]`.
- Preserve aspect ratio: r=min(416/width,416/height), resize to floor(width*r),floor(height*r).
- Place resized image at top-left; pad bottom/right with channel value 114.
- BGR channel order, values 0..255. No /255, mean or std normalization.
- Android Bitmap is RGB: explicitly write B, G, R planes.
- Use bilinear resize; do not square-stretch or center-crop.

## Output
- Name `output`, float32 `[1, 3549, 85]`.
- Each candidate: raw x,y,w,h (4), objectness (1), 80 class probabilities.
- Objectness/class sigmoid is already inside the model: do not sigmoid again.
- Coordinates are NOT decoded inside this file.
- Decode strides 8,16,32 in order, row-major grids:
  cx=(rawX+gridX)*stride; cy=(rawY+gridY)*stride;
  width=exp(rawW)*stride; height=exp(rawH)*stride.
- Confidence = objectness * classProbability. No softmax.
- Convert center boxes to corners, divide coordinates by r, clip to original image.
- Apply score filtering and NMS outside the model. Thresholds are app policy, not model metadata.
- 3549 = 52*52 + 26*26 + 13*13; these are candidates, not detected object count.
- labels_coco.json: contiguous 0..79 indices, person=0; not sparse COCO category IDs.

## Verification and caveat
ONNX checker + CPU ONNX Runtime inference passed on 4 existing catalog images.
BGR raw preprocessing produced maximum person scores 0.791,0.920,0.918,0.872.
Legacy RGB normalized preprocessing produced scores below 0.001 on all 4.
The release-tag Python demo has legacy preprocessing; use the above contract for these exact bytes.
This is a desktop smoke test, not an accuracy benchmark or Android performance test.
Kotlin inference integration and device testing are not yet implemented.

Official current preprocessing:
https://github.com/Megvii-BaseDetection/YOLOX/blob/main/yolox/data/data_augment.py
Official decode/postprocessing:
https://github.com/Megvii-BaseDetection/YOLOX/blob/main/yolox/utils/demo_utils.py
License: see LICENSE (upstream Apache-2.0).
