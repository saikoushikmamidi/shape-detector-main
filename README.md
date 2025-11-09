# Shape Detection Challenge

## Overview

This project implements a **shape detection algorithm** that identifies and classifies geometric shapes in images. The supported shapes are:

- Circle
- Triangle
- Rectangle
- Pentagon
- Star

The solution uses **browser-native APIs and mathematical analysis** without relying on external computer vision libraries.

---

## Approach Followed in `detectShapes` Function

The `detectShapes` function in `src/main.ts` follows these steps:

### 1. Grayscale Conversion
- Converts the input image to grayscale using the formula:
Gray = 0.299R + 0.587G + 0.114*B

- This simplifies pixel values and reduces the image to one channel.

### 2. Otsu Thresholding
- Computes an optimal threshold value to binarize the image.
- Shapes become white (foreground), background becomes black.

### 3. Binarization
- Converts the grayscale image into a binary image (white shapes, black background).

### 4. Flood-Fill for Connected Components
- Detects connected white pixels as individual shapes.
- Calculates **bounding box**, **center**, **area**, and stores all pixel coordinates.

### 5. Edge Detection & Perimeter Calculation
- Detects edge pixels for each shape.
- Calculates **perimeter** and stores edge points to estimate corners.

### 6. Corner Estimation
- Samples points along the edge to detect sharp corners.
- Computes angles between consecutive points.
- Counts corners based on sharp angle thresholds.

### 7. Shape Classification
- Uses **corner count**, **circularity**, and **fill ratio**:
- **Triangle:** ≤ 3 corners  
- **Rectangle:** 4–5 corners, high circularity  
- **Pentagon:** 4–5 corners, lower circularity  
- **Star:** > 7 corners, low fill ratio, low circularity  
- **Circle:** Default fallback for smooth curves or ambiguous shapes

### 8. Confidence & Bounding Box
- Assigns a confidence score to each detected shape.
- Returns bounding box `(x, y, width, height)` and center coordinates.

### 9. Output
- Returns an array of detected shapes:
```ts
interface DetectedShape {
  type: "circle" | "triangle" | "rectangle" | "pentagon" | "star";
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  center: { x: number; y: number };
  area: number;
}
