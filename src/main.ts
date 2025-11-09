import "./style.css";
import { SelectionManager } from "./ui-utils.js";
import { EvaluationManager } from "./evaluation-manager.js";

export interface Point {
  x: number;
  y: number;
}

export interface DetectedShape {
  type: "circle" | "triangle" | "rectangle" | "pentagon" | "star";
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  center: Point;
  area: number;
}

export interface DetectionResult {
  shapes: DetectedShape[];
  processingTime: number;
  imageWidth: number;
  imageHeight: number;
}

export class ShapeDetector {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  async detectShapes(imageData: ImageData): Promise<DetectionResult> {
    const start = performance.now();
    const { width, height, data } = imageData;

    // --- Step 1: Grayscale
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0; i < data.length; i += 4) {
      gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    // --- Step 2: Otsu threshold
    const hist = new Array(256).fill(0);
    for (const g of gray) hist[g]++;
    const total = width * height;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, maxVar = 0, thresh = 127;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += i * hist[i];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) ** 2;
      if (between > maxVar) {
        maxVar = between;
        thresh = i;
      }
    }

    // --- Step 3: Binarize (white shapes)
    const binary = new Uint8ClampedArray(width * height);
    for (let i = 0; i < gray.length; i++) {
      binary[i] = gray[i] < thresh ? 255 : 0;
    }

    // --- Step 4: Flood-fill for connected components
    const visited = new Uint8Array(width * height);
    const shapes: DetectedShape[] = [];
    const getIndex = (x: number, y: number) => y * width + x;

    const floodFill = (sx: number, sy: number): DetectedShape | null => {
      const stack = [[sx, sy]];
      let minX = sx, maxX = sx, minY = sy, maxY = sy;
      const pixels: [number, number][] = [];

      while (stack.length) {
        const [x, y] = stack.pop()!;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const idx = getIndex(x, y);
        if (visited[idx] || binary[idx] === 0) continue;
        visited[idx] = 1;
        pixels.push([x, y]);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }

      const area = pixels.length;
      if (area < Math.max(50, (width * height) / 15000)) return null;

      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;

      // Compute perimeter and edge points
      let perimeter = 0;
      const edges: [number, number][] = [];
      for (const [x, y] of pixels) {
        const idx = getIndex(x, y);
        const neighbors = [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ];
        let border = false;
        for (const [nx, ny] of neighbors) {
          const ni = getIndex(nx, ny);
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || binary[ni] === 0) {
            border = true;
            break;
          }
        }
        if (border) {
          perimeter++;
          edges.push([x, y]);
        }
      }

      // --- Improved corner estimation
      let corners = 0;
      const sampleStep = Math.max(2, Math.floor(edges.length / 50));
      for (let i = 0; i < edges.length; i += sampleStep) {
        const [x1, y1] = edges[i];
        const [x2, y2] = edges[(i + sampleStep) % edges.length];
        const [x3, y3] = edges[(i + 2 * sampleStep) % edges.length];
        const v1x = x2 - x1, v1y = y2 - y1;
        const v2x = x3 - x2, v2y = y3 - y2;
        const dot = v1x * v2x + v1y * v2y;
        const mag1 = Math.hypot(v1x, v1y);
        const mag2 = Math.hypot(v2x, v2y);
        if (mag1 * mag2 === 0) continue;
        const cos = dot / (mag1 * mag2);
        const angle = Math.acos(Math.min(1, Math.max(-1, cos)));
        if (angle > 0.4 && angle < 1.3) corners++;

 // sharper turns
      }

      const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
      const fillRatio = area / (w * h);

      // --- Classification (refined)
      let type: DetectedShape["type"] = "circle";

if (corners <= 3) {
  type = "triangle";
} else if (corners <= 5) {
  // Distinguish rectangle vs pentagon
  type = circularity > 0.70 ? "rectangle" : "pentagon";
} else if (corners > 7) {
  // Star tends to have many corners and low fill ratio
  if (fillRatio < 0.55 && circularity < 0.6) type = "star";
  else type = "circle";
} else {
  type = "circle";
}



      return {
        type,
        confidence: 0.9,
        boundingBox: { x: minX, y: minY, width: w, height: h },
        center: { x: cx, y: cy },
        area,
      };
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = getIndex(x, y);
        if (binary[idx] === 255 && !visited[idx]) {
          const shape = floodFill(x, y);
          if (shape) shapes.push(shape);
        }
      }
    }

    const processingTime = performance.now() - start;
    return { shapes, processingTime, imageWidth: width, imageHeight: height };
  }

  loadImage(file: File): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.canvas.width = img.width;
        this.canvas.height = img.height;
        this.ctx.drawImage(img, 0, 0);
        const imageData = this.ctx.getImageData(0, 0, img.width, img.height);
        resolve(imageData);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
}


class ShapeDetectionApp {
  private detector: ShapeDetector;
  private imageInput: HTMLInputElement;
  private resultsDiv: HTMLDivElement;
  private testImagesDiv: HTMLDivElement;
  private evaluateButton: HTMLButtonElement;
  private evaluationResultsDiv: HTMLDivElement;
  private selectionManager: SelectionManager;
  private evaluationManager: EvaluationManager;

  constructor() {
    const canvas = document.getElementById("originalCanvas") as HTMLCanvasElement;
    this.detector = new ShapeDetector(canvas);

    this.imageInput = document.getElementById("imageInput") as HTMLInputElement;
    this.resultsDiv = document.getElementById("results") as HTMLDivElement;
    this.testImagesDiv = document.getElementById("testImages") as HTMLDivElement;
    this.evaluateButton = document.getElementById("evaluateButton") as HTMLButtonElement;
    this.evaluationResultsDiv = document.getElementById("evaluationResults") as HTMLDivElement;

    this.selectionManager = new SelectionManager();
    this.evaluationManager = new EvaluationManager(this.detector, this.evaluateButton, this.evaluationResultsDiv);

    this.setupEventListeners();
    this.loadTestImages().catch(console.error);
  }

  private setupEventListeners(): void {
    this.imageInput.addEventListener("change", async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) await this.processImage(file);
    });

    this.evaluateButton.addEventListener("click", async () => {
      const selected = this.selectionManager.getSelectedImages();
      await this.evaluationManager.runSelectedEvaluation(selected);
    });
  }

  private async processImage(file: File): Promise<void> {
    try {
      this.resultsDiv.innerHTML = "<p>Processing...</p>";
      const imageData = await this.detector.loadImage(file);
      const results = await this.detector.detectShapes(imageData);
      this.displayResults(results);
    } catch (err) {
      this.resultsDiv.innerHTML = `<p>Error: ${err}</p>`;
    }
  }

  private displayResults(results: DetectionResult): void {
    const { shapes, processingTime } = results;
    let html = `
      <p><strong>Processing Time:</strong> ${processingTime.toFixed(2)}ms</p>
      <p><strong>Shapes Found:</strong> ${shapes.length}</p>
    `;

    if (shapes.length) {
      html += "<h4>Detected Shapes:</h4><ul>";
      for (const s of shapes) {
        html += `
          <li>
            <strong>${s.type}</strong><br>
            Confidence: ${(s.confidence * 100).toFixed(1)}%<br>
            Center: (${s.center.x.toFixed(1)}, ${s.center.y.toFixed(1)})<br>
            Area: ${s.area.toFixed(1)}px²
          </li>`;
      }
      html += "</ul>";
    } else {
      html += "<p>No shapes detected.</p>";
    }

    this.resultsDiv.innerHTML = html;
  }

  private async loadTestImages(): Promise<void> {
    try {
      const module = await import("./test-images-data.js");
      const testImages = module.testImages;
      const names = module.getAllTestImageNames();

      let html =
        '<h4>Click to upload your own image or use test images for detection:</h4><div class="evaluation-controls"><button id="selectAllBtn">Select All</button><button id="deselectAllBtn">Deselect All</button><span class="selection-info">0 images selected</span></div><div class="test-images-grid">';

      html += `
        <div class="test-image-item upload-item" onclick="triggerFileUpload()">
          <div class="upload-icon">📁</div>
          <div class="upload-text">Upload Image</div>
          <div class="upload-subtext">Click to select file</div>
        </div>
      `;

      names.forEach((name) => {
        const dataUrl = testImages[name as keyof typeof testImages];
        const displayName = name.replace(/[_-]/g, " ").replace(/\.(svg|png)$/i, "");
        html += `
          <div class="test-image-item" data-image="${name}"
               onclick="loadTestImage('${name}', '${dataUrl}')"
               oncontextmenu="toggleImageSelection(event, '${name}')">
            <img src="${dataUrl}" alt="${name}">
            <div>${displayName}</div>
          </div>`;
      });

      html += "</div>";
      this.testImagesDiv.innerHTML = html;

      this.selectionManager.setupSelectionControls();

      (window as any).loadTestImage = async (name: string, dataUrl: string) => {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const file = new File([blob], name, { type: "image/svg+xml" });
        const imgData = await this.detector.loadImage(file);
        const res = await this.detector.detectShapes(imgData);
        this.displayResults(res);
      };

      (window as any).toggleImageSelection = (e: MouseEvent, name: string) => {
        e.preventDefault();
        this.selectionManager.toggleImageSelection(name);
      };

      (window as any).triggerFileUpload = () => this.imageInput.click();
    } catch {
      this.testImagesDiv.innerHTML = "<p>Test images not available.</p>";
    }
  }
}

document.addEventListener("DOMContentLoaded", () => new ShapeDetectionApp());